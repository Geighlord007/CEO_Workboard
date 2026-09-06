import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { notes, links } from "@db/schema";

/** 便签路由 */
export const noteRouter = createRouter({
  list: authedQuery.query(() =>
    getDb().select().from(notes).orderBy(asc(notes.sortOrder), asc(notes.id)),
  ),

  create: authedQuery
    .input(z.object({ content: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ input }) => {
      await getDb().insert(notes).values({ content: input.content });
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(notes).where(eq(notes.id, input.id));
    }),
});

/** 快捷入口路由 */
export const linkRouter = createRouter({
  list: authedQuery.query(() =>
    getDb().select().from(links).orderBy(asc(links.sortOrder), asc(links.id)),
  ),

  create: authedQuery
    .input(
      z.object({
        label: z.string().trim().min(1).max(100),
        url: z.string().trim().url().max(1000),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb().insert(links).values(input);
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(links).where(eq(links.id, input.id));
    }),
});
