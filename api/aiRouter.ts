/**
 * 看板指令助手 · ai.plan / ai.execute
 * 输入一句话 → 组装"最小上下文" → 交给 LLM 理解成意图 → 服务端展开成步骤返回。
 * 前端预览/确认后调用 ai.execute：整批步骤在单个事务里执行，
 * 任一步失败即整体回滚，不会留下执行了一半的中间状态。
 */
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, risks, notes, activity, accounts, opportunities, suppliers } from "@db/schema";
import { addDays, dayFmt, mondayOf } from "./helpers";
import { chatJson } from "./lib/llm";
import { env } from "./lib/env";
import { planFromIntents, type PlanCtx, type TaskRow, type RiskRow, type NoteRow } from "./plan";
import { executeSteps, executeStepsInput, type ExecuteResult } from "./execute";
import type { PlanReply } from "@contracts/commands";

export type AiPlanResp = PlanReply | { ok: false; code: "not_configured"; message: string };

export function buildSystemPrompt(): string {
  return `你是「每周任务控制台」的命令理解器。用户会用自然语言要求修改看板数据，你要把它翻译成白名单操作。

严格规则：
1. 只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块。两种形状二选一：
   {"intents":[...]}  或  {"ask":"需要向用户确认的一句话"}
2. 用户消息末尾会附"当前上下文"JSON，含三周的周起始日期（weekOf）、任务/风险/便签 id，以及 CRM 客户（accounts）和商机（opportunities）列表。规则：
   - 涉及已有任务/风险/便签/商机时，id 只能取上下文里真实存在的 id；禁止编造 id。
   - 新建联系人、商机、沟通记录、样品、询价、供应商事件时，accountId / subjectId / supplierId / opportunityId 也必须取自上下文真实 id。
   - 表示"全部/所有/都"时，把对应范围内每个 id 展开成独立 intent（逐个列出）。
   - 新建任务（task.create）的 weekOf 必须取上下文列出的 weekOf 之一；业务线不确定用 "bd"。
   - 用户说相对时间（明天/周五/下周X/月底）时，按上下文给的"今天日期"换算成 YYYY-MM-DD。
3. 只有用户明确表达修改意图才返回 intents；若只是询问/信息不足/无法唯一确定目标，
   一律返回 {"ask":"..."}，用一句话问清楚，绝不猜测执行。
4. 支持的操作 kind 及字段：
   - task.done    {"kind":"task.done","id":任务id,"done":true|false}      标记完成/取消完成
   - task.update  {"kind":"task.update","id":任务id,"patch":{可选:title|track|priority|dueDate}}  改任务字段
   - task.create  {"kind":"task.create","title":"标题","track":"bd|research|supplier|ceo","priority":0-2,"dueDate":YYYY-MM-DD或null,"weekOf":"周一起始日"}  新建任务
   - task.remove  {"kind":"task.remove","id":任务id}                      删除任务
   - task.carry   {"kind":"task.carry","id":任务id,"targetWeekOf":"周一起始日"}  把未完成任务顺延/复制到另一周
   - risk.create  {"kind":"risk.create","title":"...","level":"high|mid|low","detail":"...或null","needFrom":"...或null"}  新建风险
   - risk.resolve {"kind":"risk.resolve","id":风险id,"resolved":true}    解决/重开风险
   - risk.remove  {"kind":"risk.remove","id":风险id}                      删除风险
   - note.create  {"kind":"note.create","content":"..."}                  记便签
   - note.remove  {"kind":"note.remove","id":便签id}                      删除便签
   - event.create {"kind":"event.create","date":"YYYY-MM-DD","title":"...","category":"meeting|milestone|deadline|trip|other","startMin":分钟数或null,"endMin":分钟数或null,"location":"...或null"}  新增日历事项（时间换算成当天 0 点起分钟数）
   - milestone.create {"kind":"milestone.create","title":"...","startDate":"YYYY-MM-DD","targetDate":"YYYY-MM-DD"}  新增关键节点/倒计时
   - offwork.set  {"kind":"offwork.set","minutes":分钟数}                 设置"今天"收工时间
   - account.create {"kind":"account.create","name":"机构名","accountKind":"company|institute|lab|government|other","industry":"...或null","source":"...或null"}  新建客户/机构
   - contact.add    {"kind":"contact.add","accountId":客户id,"name":"姓名","roleInDeal":"scientist|procurement|qa|finance|exec|decisionMaker|techContact或null","title":"...或null"}  给客户加联系人
   - opp.create     {"kind":"opp.create","accountId":客户id,"title":"商机标题","stage":"identify|tech_discussion|proposal_quote|sample_poc|contract|delivery","amountCny":数字或null}  新建商机（只能从识别到交付执行阶段开始，不能一开始就是 won/lost）
   - opp.stage      {"kind":"opp.stage","id":商机id,"stage":"identify|tech_discussion|proposal_quote|sample_poc|contract|delivery|won|lost","lostReason":"...或null"}  移动商机阶段（id 只能取自上下文）
   - activity.log   {"kind":"activity.log","subjectType":"opportunity|account","subjectId":id,"activityKind":"call|wechat|email|meeting|visit|sample|other或null","summary":"精炼的沟通要点","nextActionAt":"YYYY-MM-DD或null"}  记录一次沟通，并可能设置下次跟进日
   - supplier.create {"kind":"supplier.create","name":"供应商名","category":"...或null","contactName":"...或null"}  新建供应商
   - sample.create   {"kind":"sample.create","title":"样品标题","opportunityId":商机id或null,"accountId":客户id或null,"status":"requested|sent|testing|passed|failed|retest","sentAt":"YYYY-MM-DD或null"}  记样品（opportunityId/accountId 至少给一个，且必须取自上下文）
   - supplier.rfq    {"kind":"supplier.rfq","supplierId":供应商id,"item":"询价项","priceCny":数字或null,"deliveryDays":整数或null,"validUntil":"YYYY-MM-DD或null","status":"asking|comparing|chosen|dropped"}  向供应商询价（supplierId 取自上下文）
   - supplier.event  {"kind":"supplier.event","supplierId":供应商id,"eventKind":"delay|quality|service","summary":"事件摘要","impact":"影响或null"}  记供应商交期/质量/服务事件（supplierId 取自上下文）
5. 业务线关键词：BD/拓展/客户/渠道/商机→bd；调研/研究/竞品/政策/市场→research；
   供应商/交付/质量/产能→supplier；老板/CEO/董事会/行程/会务/投资人→ceo。
6. 一天最多输出 60 个 intent。`;
}

export function buildUserPrompt(text: string, ctx: PlanCtx): string {
  const todayLabel = `${ctx.today}（周${["日", "一", "二", "三", "四", "五", "六"][new Date(ctx.today + "T00:00:00").getDay()]}）`;
  const tasksJson = ctx.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    weekOf: t.weekOf,
    track: t.track,
    priority: t.priority,
    done: t.done,
    dueDate: t.dueDate,
  }));
  const ctxJson = JSON.stringify({
    today: ctx.today,
    todayLabel,
    weeks: ctx.allowedWeeks.map((w, i) => ({
      weekOf: w,
      tag: ["上周", "本周", "下周"][i],
    })),
    tasks: tasksJson,
    risks: ctx.risks.map((r) => ({
      id: r.id,
      title: r.title,
      level: r.level,
      resolved: r.resolved,
    })),
    notes: ctx.notes.map((n) => ({ id: n.id, content: n.content.slice(0, 120) })),
    accounts: ctx.accounts,
    opportunities: ctx.opportunities.map((o) => ({
      id: o.id,
      title: o.title,
      accountId: o.accountId,
      stage: o.stage,
    })),
    suppliers: ctx.suppliers,
  });
  return `用户指令：${text}\n\n=====当前上下文=====\n${ctxJson}`;
}

export const aiRouter = createRouter({
  /** 解析一条指令 → 待确认步骤列表（不改数据） */
  plan: authedQuery
    .input(z.object({ text: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ input }): Promise<AiPlanResp> => {
      const { llm } = env;
      if (!llm.baseUrl || !llm.apiKey || !llm.model) {
        return {
          ok: false,
          code: "not_configured",
          message: "尚未配置 LLM（LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）。请在环境变量中配置后刷新。",
        };
      }

      // —— 组装最小上下文（一次查询，LLM 只能看到这里的数据）——
      const db = getDb();
      const mon = mondayOf(new Date());
      const [prevW, thisW, nextW] = [dayFmt(addDays(mon, -7)), dayFmt(mon), dayFmt(addDays(mon, 7))];
      const [taskRows, riskRows, noteRows, accountRows, oppRows, supplierRows] = await Promise.all([
        db.select().from(tasks).where(inArray(tasks.weekOf, [prevW, thisW, nextW])),
        db.select().from(risks),
        db.select().from(notes),
        db.select({ id: accounts.id, name: accounts.name }).from(accounts).orderBy(accounts.name).limit(300),
        db
          .select({ id: opportunities.id, title: opportunities.title, accountId: opportunities.accountId, stage: opportunities.stage })
          .from(opportunities)
          .limit(500),
        db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(suppliers.name).limit(200),
      ]);
      const todayStr = dayFmt(new Date());
      const actRows = await db
        .select()
        .from(activity)
        .where(eq(activity.day, todayStr))
        .limit(1);

      const ctx: PlanCtx = {
        today: todayStr,
        allowedWeeks: [prevW, thisW, nextW],
        tasks: taskRows.map<TaskRow>((t) => ({
          id: t.id,
          title: t.title,
          weekOf: t.weekOf,
          track: t.track,
          priority: t.priority,
          done: t.done,
          dueDate: t.dueDate,
          link: t.link,
          sortOrder: t.sortOrder,
          completedDay: t.completedDay,
        })),
        risks: riskRows.map<RiskRow>((r) => ({
          id: r.id,
          title: r.title,
          detail: r.detail,
          needFrom: r.needFrom,
          level: r.level,
          resolved: r.resolved,
        })),
        notes: noteRows.map<NoteRow>((n) => ({ id: n.id, content: n.content, sortOrder: n.sortOrder })),
        activityToday: actRows[0] ? { minutes: actRows[0].offworkMin } : null,
        accounts: accountRows,
        opportunities: oppRows,
        suppliers: supplierRows,
      };

      // —— 调 LLM 理解 ——
      const userPrompt = buildUserPrompt(input.text, ctx);
      let raw: string;
      try {
        raw = await chatJson({
          system: buildSystemPrompt(),
          user: userPrompt,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          code: "error",
          message: `智能助手暂不可用（${reason.slice(0, 120)}），请稍后再试。`,
        };
      }
      return planFromIntents(raw, ctx);
    }),

  /** 执行一组已确认的步骤（单事务：任一步失败整体回滚，返回失败位置） */
  execute: authedQuery
    .input(executeStepsInput)
    .mutation(async ({ input }): Promise<ExecuteResult> => executeSteps(input.steps)),
});
