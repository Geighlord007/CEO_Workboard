import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { risks, deals } from "@db/schema";

/** 风险与阻塞路由（红灯项） */
export const riskRouter = createRouter({
  list: authedQuery.query(() =>
    getDb()
      .select()
      .from(risks)
      .orderBy(asc(risks.resolved), asc(risks.level), desc(risks.id)),
  ),

  create: authedQuery
    .input(
      z.object({
        title: z.string().trim().min(1).max(255),
        detail: z.string().max(2000).nullish(),
        needFrom: z.string().max(255).nullish(),
        level: z.enum(["high", "mid", "low"]).default("mid"),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .insert(risks)
        .values({
          title: input.title,
          detail: input.detail ?? null,
          needFrom: input.needFrom ?? null,
          level: input.level,
        });
    }),

  setResolved: authedQuery
    .input(z.object({ id: z.number(), resolved: z.boolean() }))
    .mutation(async ({ input }) => {
      await getDb()
        .update(risks)
        .set({ resolved: input.resolved })
        .where(eq(risks.id, input.id));
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(risks).where(eq(risks.id, input.id));
    }),
});

const STAGES = ["contact", "proposal", "quote", "won"] as const;

/** BD pipeline 路由 */
export const dealRouter = createRouter({
  list: authedQuery.query(() =>
    getDb().select().from(deals).orderBy(asc(deals.sortOrder), asc(deals.id)),
  ),

  create: authedQuery
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        stage: z.enum(STAGES).default("contact"),
        note: z.string().max(500).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .insert(deals)
        .values({ name: input.name, stage: input.stage, note: input.note ?? null });
    }),

  /** 阶段前移/后移一格 */
  move: authedQuery
    .input(z.object({ id: z.number(), dir: z.union([z.literal(-1), z.literal(1)]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const deal = await db.query.deals.findFirst({ where: eq(deals.id, input.id) });
      if (!deal) return;
      const idx = STAGES.indexOf(deal.stage);
      const next = STAGES[Math.min(Math.max(idx + input.dir, 0), STAGES.length - 1)];
      if (next !== deal.stage) {
        await db.update(deals).set({ stage: next }).where(eq(deals.id, input.id));
      }
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(deals).where(eq(deals.id, input.id));
    }),
});
