import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { events, milestones } from "@db/schema";
import { DAY_RE } from "./helpers";

const timeMin = z.number().int().min(0).max(1439).nullish();

/** 日历事项路由：月历红点 + 今日日程数据源 */
export const eventRouter = createRouter({
  list: authedQuery.query(() =>
    getDb()
      .select()
      .from(events)
      .orderBy(asc(events.date), asc(events.startMin), asc(events.id)),
  ),

  create: authedQuery
    .input(
      z.object({
        date: z.string().regex(DAY_RE),
        title: z.string().trim().min(1).max(255),
        kind: z.enum(["meeting", "milestone", "deadline", "trip", "other"]).default("meeting"),
        startMin: timeMin,
        endMin: timeMin,
        location: z.string().max(255).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .insert(events)
        .values({
          date: input.date,
          title: input.title,
          kind: input.kind,
          startMin: input.startMin ?? null,
          endMin: input.endMin ?? null,
          location: input.location ?? null,
        });
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(events).where(eq(events.id, input.id));
    }),
});

/** 关键节点路由：倒计时数据源 */
export const milestoneRouter = createRouter({
  list: authedQuery.query(() =>
    getDb().select().from(milestones).orderBy(asc(milestones.targetDate)),
  ),

  create: authedQuery
    .input(
      z.object({
        title: z.string().trim().min(1).max(255),
        startDate: z.string().regex(DAY_RE),
        targetDate: z.string().regex(DAY_RE),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb().insert(milestones).values(input);
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().trim().min(1).max(255),
        startDate: z.string().regex(DAY_RE),
        targetDate: z.string().regex(DAY_RE),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .update(milestones)
        .set({
          title: input.title,
          startDate: input.startDate,
          targetDate: input.targetDate,
        })
        .where(eq(milestones.id, input.id));
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(milestones).where(eq(milestones.id, input.id));
    }),
});
