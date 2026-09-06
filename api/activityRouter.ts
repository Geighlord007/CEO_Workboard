import { z } from "zod";
import { and, asc, gte, lte } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { activity } from "@db/schema";
import { DAY_RE } from "./helpers";

/** 每日活动路由：打卡强度手动覆盖 + 收工时间 */
export const activityRouter = createRouter({
  range: authedQuery
    .input(z.object({ from: z.string().regex(DAY_RE), to: z.string().regex(DAY_RE) }))
    .query(({ input }) =>
      getDb()
        .select()
        .from(activity)
        .where(and(gte(activity.day, input.from), lte(activity.day, input.to)))
        .orderBy(asc(activity.day)),
    ),

  /** 覆盖某天的打卡强度（0-3），热力图点击今天格子时调用 */
  setLevel: authedQuery
    .input(z.object({ day: z.string().regex(DAY_RE), level: z.number().int().min(0).max(3) }))
    .mutation(async ({ input }) => {
      await getDb()
        .insert(activity)
        .values({ day: input.day, level: input.level })
        .onDuplicateKeyUpdate({ set: { level: input.level } });
    }),

  /** 记录某天的收工时间（距零点分钟数） */
  setOffwork: authedQuery
    .input(z.object({ day: z.string().regex(DAY_RE), minutes: z.number().int().min(0).max(1439) }))
    .mutation(async ({ input }) => {
      await getDb()
        .insert(activity)
        .values({ day: input.day, offworkMin: input.minutes })
        .onDuplicateKeyUpdate({ set: { offworkMin: input.minutes } });
    }),
});
