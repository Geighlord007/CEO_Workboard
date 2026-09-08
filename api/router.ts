import { authRouter } from "./auth-router";
import { aiRouter } from "./aiRouter";
import { createRouter, publicQuery } from "./middleware";
import { taskRouter } from "./taskRouter";
import { eventRouter, milestoneRouter } from "./eventRouter";
import { noteRouter, linkRouter } from "./noteRouter";
import { riskRouter, dealRouter } from "./riskRouter";
import { activityRouter } from "./activityRouter";
import { reportRouter } from "./reportRouter";
import { crmRouter } from "./crmRouter";
import { dataRouter } from "./dataRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  task: taskRouter,
  event: eventRouter,
  milestone: milestoneRouter,
  note: noteRouter,
  link: linkRouter,
  risk: riskRouter,
  deal: dealRouter,
  activity: activityRouter,
  ai: aiRouter,
  report: reportRouter,
  crm: crmRouter,
  data: dataRouter,
});

export type AppRouter = typeof appRouter;
