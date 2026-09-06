import { z } from "zod";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { settings, tasks, risks, milestones } from "@db/schema";
import { addDays, dayFmt, mondayOf } from "./helpers";

async function ensureToken(): Promise<string> {
  const db = getDb();
  const [row] = await db.select().from(settings).where(eq(settings.k, "shareToken"));
  if (row?.v) return row.v;
  const token = randomUUID();
  await db.insert(settings).values({ k: "shareToken", v: token });
  return token;
}

/** 周报路由：老板只读视图的公开聚合接口 + 令牌管理（需登录） */
export const reportRouter = createRouter({
  /** 获取（不存在则生成）分享令牌 —— 登录后可用 */
  getToken: authedQuery.query(() => ensureToken()),

  /** 轮换令牌（旧链接立即失效） */
  rotateToken: authedQuery.mutation(async () => {
    const token = randomUUID();
    await getDb()
      .insert(settings)
      .values({ k: "shareToken", v: token })
      .onDuplicateKeyUpdate({ set: { v: token } });
    return token;
  }),

  /**
   * 老板周报聚合（公开，凭令牌访问）。
   * 数据全部从业务表实时聚合，无需单独维护周报。
   */
  byToken: publicQuery
    .input(z.object({ token: z.string().min(8).max(100) }))
    .query(async ({ input }) => {
      const db = getDb();
      const [row] = await db.select().from(settings).where(eq(settings.k, "shareToken"));
      if (!row?.v || row.v !== input.token) {
        throw new TRPCError({ code: "NOT_FOUND", message: "链接无效或已过期" });
      }
      const mon = mondayOf(new Date());
      const weekOf = dayFmt(mon);
      const nextWeekOf = dayFmt(addDays(mon, 7));

      const [weekTasks, nextTasks, openRisks, ms] = await Promise.all([
        db
          .select()
          .from(tasks)
          .where(eq(tasks.weekOf, weekOf))
          .orderBy(asc(tasks.done), asc(tasks.priority), asc(tasks.sortOrder), asc(tasks.id)),
        db
          .select()
          .from(tasks)
          .where(eq(tasks.weekOf, nextWeekOf))
          .orderBy(asc(tasks.priority), asc(tasks.sortOrder), asc(tasks.id)),
        db
          .select()
          .from(risks)
          .where(eq(risks.resolved, false))
          .orderBy(asc(risks.level)),
        db.select().from(milestones).orderBy(asc(milestones.targetDate)),
      ]);

      return {
        generatedAt: new Date(),
        weekOf,
        nextWeekOf,
        weekTasks,
        nextTasks,
        risks: openRisks,
        milestones: ms,
      };
    }),
});
