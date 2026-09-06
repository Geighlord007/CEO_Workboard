import { z } from "zod";
import { and, asc, count, eq, gte, isNotNull } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, TRACKS } from "@db/schema";
import { DAY_RE, dayFmt } from "./helpers";

/** 任务路由：周清单增删勾选 + 按完成日期聚合（热力图/趋势线数据源） */
export const taskRouter = createRouter({
  /** 某一周（周一日期）的全部任务 */
  listWeek: authedQuery
    .input(z.object({ weekOf: z.string().regex(DAY_RE) }))
    .query(({ input }) =>
      getDb()
        .select()
        .from(tasks)
        .where(eq(tasks.weekOf, input.weekOf))
        .orderBy(
          asc(tasks.done),
          asc(tasks.priority),
          asc(tasks.sortOrder),
          asc(tasks.id),
        ),
    ),

  /** 所有带截止日期的任务（月历/今日日程合并显示用） */
  listDated: authedQuery.query(() =>
    getDb()
      .select()
      .from(tasks)
      .where(isNotNull(tasks.dueDate))
      .orderBy(asc(tasks.dueDate), asc(tasks.id)),
  ),

  create: authedQuery
    .input(
      z.object({
        title: z.string().trim().min(1).max(500),
        track: z.enum(TRACKS),
        priority: z.number().int().min(0).max(2).default(1),
        dueDate: z.string().regex(DAY_RE).nullish(),
        link: z.string().max(1000).nullish(),
        weekOf: z.string().regex(DAY_RE),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .insert(tasks)
        .values({
          title: input.title,
          track: input.track,
          priority: input.priority,
          dueDate: input.dueDate ?? null,
          link: input.link ?? null,
          weekOf: input.weekOf,
        });
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().trim().min(1).max(500),
        track: z.enum(TRACKS),
        priority: z.number().int().min(0).max(2),
        dueDate: z.string().regex(DAY_RE).nullish(),
        link: z.string().max(1000).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .update(tasks)
        .set({
          title: input.title,
          track: input.track,
          priority: input.priority,
          dueDate: input.dueDate ?? null,
          link: input.link ?? null,
        })
        .where(eq(tasks.id, input.id));
    }),

  /** 勾选/取消勾选；day = 前端本地今天，用于热力图按天聚合 */
  toggle: authedQuery
    .input(
      z.object({
        id: z.number(),
        done: z.boolean(),
        day: z.string().regex(DAY_RE).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .update(tasks)
        .set(
          input.done
            ? { done: true, completedAt: new Date(), completedDay: input.day ?? null }
            : { done: false, completedAt: null, completedDay: null },
        )
        .where(eq(tasks.id, input.id));
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(tasks).where(eq(tasks.id, input.id));
    }),

  /** 最近 N 天按完成日期聚合的任务数：[{ day, c }] */
  counts: authedQuery
    .input(z.object({ days: z.number().int().min(1).max(400).default(84) }))
    .query(async ({ input }) => {
      const since = new Date();
      since.setDate(since.getDate() - (input.days - 1));
      return getDb()
        .select({ day: tasks.completedDay, c: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.done, true),
            isNotNull(tasks.completedDay),
            gte(tasks.completedDay, dayFmt(since)),
          ),
        )
        .groupBy(tasks.completedDay);
    }),
});
