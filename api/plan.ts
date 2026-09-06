/**
 * 看板指令助手 · 意图→步骤 展开器（纯函数，无 DB/网络依赖，便于单测）
 * 职责：把 LLM 的意图 JSON 对照"真实上下文"展开为带 label/before 的执行步骤；
 * 任何引用不到、不合法、冲突的意图都会被拦下并回给用户原因，绝不猜测执行。
 */
import { z } from "zod";
import {
  intentsSchema,
  stepSchema,
  type PlanReply,
  type LlmIntents,
  CMD_ACCOUNT_KINDS,
  CMD_CONTACT_ROLES,
  CMD_OPP_STAGES,
  CMD_ACTIVITY_KINDS,
  CMD_SAMPLE_STATUS,
  CMD_SUPPLIER_EVENT_KINDS,
} from "@contracts/commands";

const stepsArraySchema = z.array(stepSchema);

/* ---------- 最小上下文类型（由 aiRouter 从 DB 组装后传入） ---------- */
export interface TaskRow {
  id: number;
  title: string;
  weekOf: string;
  track: "bd" | "research" | "supplier" | "ceo";
  priority: number;
  done: boolean;
  dueDate: string | null;
  link: string | null;
  sortOrder: number;
  completedDay: string | null;
}
export interface RiskRow {
  id: number;
  title: string;
  detail: string | null;
  needFrom: string | null;
  level: "high" | "mid" | "low";
  resolved: boolean;
}
export interface NoteRow {
  id: number;
  content: string;
  sortOrder: number;
}
export interface PlanCtx {
  today: string;
  /** LLM 可引用的周（上/本/下周等），新建与结转的目标周只能从这里选 */
  allowedWeeks: string[];
  tasks: TaskRow[];
  risks: RiskRow[];
  notes: NoteRow[];
  /** 今天 activity 行（可能不存在） */
  activityToday: { minutes: number | null } | null;
  /** CRM 客户/商机快照，供 LLM 引用真实 id */
  accounts: { id: number; name: string }[];
  opportunities: { id: number; title: string; accountId: number; stage: string }[];
  /** 供应商快照 */
  suppliers: { id: number; name: string }[];
}

const TRACK_CN: Record<TaskRow["track"], string> = {
  bd: "BD拓展",
  research: "调研",
  supplier: "供应商",
  ceo: "CEO",
};
const ACCOUNT_KIND_CN: Record<(typeof CMD_ACCOUNT_KINDS)[number], string> = {
  company: "公司",
  institute: "研究院",
  lab: "实验室",
  government: "政府",
  other: "其他",
};
const CONTACT_ROLE_CN: Record<(typeof CMD_CONTACT_ROLES)[number], string> = {
  scientist: "科学家",
  procurement: "采购",
  qa: "质量",
  finance: "财务",
  exec: "高管",
  decisionMaker: "决策人",
  techContact: "技术联系人",
};
const OPP_STAGE_CN: Record<(typeof CMD_OPP_STAGES)[number], string> = {
  identify: "识别",
  tech_discussion: "技术交流",
  proposal_quote: "方案与报价",
  sample_poc: "样品/POC",
  contract: "商务合同",
  delivery: "交付执行",
  won: "赢单",
  lost: "输单",
};
const ACTIVITY_KIND_CN: Record<(typeof CMD_ACTIVITY_KINDS)[number], string> = {
  call: "电话",
  wechat: "微信",
  email: "邮件",
  meeting: "会议",
  visit: "拜访",
  sample: "样品",
  other: "其他",
};
const SAMPLE_STATUS_CN: Record<(typeof CMD_SAMPLE_STATUS)[number], string> = {
  requested: "待寄",
  sent: "已寄出",
  testing: "测试中",
  passed: "通过",
  failed: "失败",
  retest: "复测",
};
const SUPPLIER_EVENT_KIND_CN: Record<(typeof CMD_SUPPLIER_EVENT_KINDS)[number], string> = {
  delay: "延误",
  quality: "质量",
  service: "服务",
};
const OPEN_OPP_STAGES = CMD_OPP_STAGES.filter((s) => s !== "won" && s !== "lost");
const LEVEL_CN: Record<RiskRow["level"], string> = {
  high: "高",
  mid: "中",
  low: "低",
};
const short = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n)}…` : s);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function parseLooseIntents(text: string): { data: LlmIntents } | { error: string } {
  // 剥掉可能的 markdown 围栏/多余文字，取第一个 { 到最后一个 }
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return { error: "模型没有返回可解析的内容" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(s, e + 1));
  } catch {
    return { error: "模型返回的 JSON 无法解析，请重试" };
  }
  const r = intentsSchema.safeParse(parsed);
  if (!r.success) {
    return { error: "模型返回了不支持的操作，已拦截（如需新能力请升级助手）" };
  }
  return { data: r.data };
}

/** 把 LLM 意图 + 当前上下文 → 可执行步骤 */
export function planFromIntents(rawLlmText: string, ctx: PlanCtx): PlanReply {
  const parsed = parseLooseIntents(rawLlmText);
  if ("error" in parsed) return { ok: false, code: "error", message: parsed.error };
  const { ask, intents = [] } = parsed.data;
  if (ask) return { ok: false, code: "ask", message: ask };

  const taskById = new Map(ctx.tasks.map((t) => [t.id, t]));
  const riskById = new Map(ctx.risks.map((r) => [r.id, r]));
  const noteById = new Map(ctx.notes.map((n) => [n.id, n]));
  const accountById = new Map(ctx.accounts.map((a) => [a.id, a]));
  const oppById = new Map(ctx.opportunities.map((o) => [o.id, o]));
  const supplierById = new Map(ctx.suppliers.map((s) => [s.id, s]));
  const weekSet = new Set(ctx.allowedWeeks);
  const weekTag = (w: string) =>
    ctx.allowedWeeks.indexOf(w) === -1
      ? w.slice(5)
      : w === ctx.allowedWeeks[0]
        ? "上周"
        : w === ctx.allowedWeeks[1]
          ? "本周"
          : w === ctx.allowedWeeks[2]
            ? "下周"
            : w.slice(5);

  const steps: unknown[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  const push = (s: unknown) => steps.push(s);
  const problem = (m: string) => problems.push(m);
  /** 去重：同一对象同一动作只保留最后一次 */
  const once = (k: string) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };

  for (const it of intents) {
    switch (it.kind) {
      case "task.done": {
        const t = taskById.get(it.id);
        if (!t) return badTarget("任务", it.id);
        if (!once(`task.done:${it.id}`)) break;
        push({
          kind: "task.done",
          id: t.id,
          title: t.title,
          weekOf: t.weekOf,
          done: it.done,
          day: it.done ? ctx.today : null,
          label: `${it.done ? "标记完成" : "取消完成"}：${t.title}（${weekTag(t.weekOf)}）`,
          before: { done: t.done, completedDay: t.completedDay },
        });
        break;
      }
      case "task.update": {
        const t = taskById.get(it.id);
        if (!t) return badTarget("任务", it.id);
        if (!once(`task.update:${it.id}`)) break;
        push({
          kind: "task.update",
          id: t.id,
          title: t.title,
          weekOf: t.weekOf,
          patch: it.patch,
          label: `修改任务「${t.title}」`,
          before: { title: t.title, track: t.track, priority: t.priority, dueDate: t.dueDate },
        });
        break;
      }
      case "task.create": {
        if (!it.weekOf) return { ok: false, code: "ask", message: "新建任务需要明确放到哪一周（本周/下周…），请补充后重发。" };
        if (!weekSet.has(it.weekOf)) {
          problem(`任务「${it.title}」要放到的周不在可选范围（${ctx.allowedWeeks.map(weekTag).join("/")}）`);
          break;
        }
        if (!once(`task.create:${it.title}:${it.weekOf}`)) break;
        const track = it.track ?? "bd";
        push({
          kind: "task.create",
          weekOf: it.weekOf,
          task: {
            title: it.title,
            track,
            priority: it.priority ?? 1,
            dueDate: it.dueDate ?? null,
          },
          label: `新建任务「${short(it.title)}」· ${TRACK_CN[track]} · ${weekTag(it.weekOf)}`,
        });
        break;
      }
      case "task.remove": {
        const t = taskById.get(it.id);
        if (!t) return badTarget("任务", it.id);
        if (!once(`task.remove:${it.id}`)) break;
        push({
          kind: "task.remove",
          id: t.id,
          weekOf: t.weekOf,
          label: `删除任务「${t.title}」`,
          before: {
            title: t.title,
            track: t.track,
            priority: t.priority,
            dueDate: t.dueDate,
            link: t.link,
            sortOrder: t.sortOrder,
            done: t.done,
            completedDay: t.completedDay,
          },
        });
        break;
      }
      case "task.carry": {
        const t = taskById.get(it.id);
        if (!t) {
          return badTarget("任务", it.id);
        }
        if (t.done) {
          problem(`任务「${t.title}」已完成，不需要结转`);
          break;
        }
        if (!weekSet.has(it.targetWeekOf)) {
          problem(`结转目标周不在可选范围`);
          break;
        }
        if (it.targetWeekOf === t.weekOf) {
          problem(`任务「${t.title}」已经在 ${weekTag(t.weekOf)}，无需结转`);
          break;
        }
        if (!once(`task.carry:${it.id}`)) break;
        push({
          kind: "task.carry",
          id: t.id,
          title: t.title,
          weekOf: t.weekOf,
          targetWeekOf: it.targetWeekOf,
          label: `结转「${t.title}」：${weekTag(t.weekOf)} → ${weekTag(it.targetWeekOf)}`,
        });
        break;
      }
      case "risk.create": {
        const level = it.level ?? "mid";
        if (!once(`risk.create:${it.title}`)) break;
        push({
          kind: "risk.create",
          label: `新增风险「${short(it.title)}」· ${LEVEL_CN[level]}${it.needFrom ? ` · 需${it.needFrom}支持` : ""}`,
          risk: {
            title: it.title,
            detail: it.detail ?? null,
            needFrom: it.needFrom ?? null,
            level,
          },
        });
        break;
      }
      case "risk.resolve": {
        const r = riskById.get(it.id);
        if (!r) return badTarget("风险", it.id);
        if (!once(`risk.resolve:${it.id}`)) break;
        push({
          kind: "risk.resolve",
          id: r.id,
          title: r.title,
          resolved: it.resolved,
          label: `${it.resolved ? "解决" : "重开"}风险「${r.title}」`,
          before: { resolved: r.resolved },
        });
        break;
      }
      case "risk.remove": {
        const r = riskById.get(it.id);
        if (!r) return badTarget("风险", it.id);
        if (!once(`risk.remove:${it.id}`)) break;
        push({
          kind: "risk.remove",
          id: r.id,
          label: `删除风险「${r.title}」`,
          before: { title: r.title, detail: r.detail, needFrom: r.needFrom, level: r.level, resolved: r.resolved },
        });
        break;
      }
      case "note.create": {
        if (!once(`note.create:${it.content}`)) break;
        push({
          kind: "note.create",
          label: `记便签「${short(it.content)}」`,
          content: it.content,
        });
        break;
      }
      case "note.remove": {
        const n = noteById.get(it.id);
        if (!n) return badTarget("便签", it.id);
        if (!once(`note.remove:${it.id}`)) break;
        push({
          kind: "note.remove",
          id: n.id,
          label: `删除便签「${short(n.content)}」`,
          before: { content: n.content, sortOrder: n.sortOrder },
        });
        break;
      }
      case "event.create": {
        const category = it.category ?? "meeting";
        const range = [it.startMin, it.endMin]
          .filter((m): m is number => m != null)
          .map(hhmm)
          .join("–");
        push({
          kind: "event.create",
          label: `新增日程「${short(it.title)}」${it.date}${range ? ` ${range}` : ""}${it.location ? ` @${it.location}` : ""}`,
          event: {
            date: it.date,
            title: it.title,
            kind: category,
            startMin: it.startMin ?? null,
            endMin: it.endMin ?? null,
            location: it.location ?? null,
          },
        });
        break;
      }
      case "milestone.create": {
        push({
          kind: "milestone.create",
          label: `新增节点「${short(it.title)}」→ ${it.targetDate}`,
          milestone: {
            title: it.title,
            startDate: it.startDate ?? ctx.today,
            targetDate: it.targetDate,
          },
        });
        break;
      }
      case "offwork.set": {
        push({
          kind: "offwork.set",
          day: ctx.today,
          minutes: it.minutes,
          label: `设置今日收工 ${hhmm(it.minutes)}`,
          before: { minutes: ctx.activityToday?.minutes ?? null },
        });
        break;
      }
      case "account.create": {
        const kind = it.accountKind ?? "company";
        if (!once(`account.create:${it.name}`)) break;
        push({
          kind: "account.create",
          label: `新建客户「${it.name}」· ${ACCOUNT_KIND_CN[kind]}`,
          account: {
            name: it.name,
            kind,
            industry: it.industry ?? null,
            source: it.source ?? null,
          },
        });
        break;
      }
      case "contact.add": {
        const account = accountById.get(it.accountId);
        if (!account) return badTarget("客户", it.accountId);
        if (!once(`contact.add:${it.accountId}:${it.name}`)) break;
        const role = it.roleInDeal ?? null;
        push({
          kind: "contact.add",
          label: `新增联系人 ${it.name}${role ? `(${CONTACT_ROLE_CN[role]})` : ""}→${account.name}`,
          contact: {
            accountId: it.accountId,
            name: it.name,
            roleInDeal: role,
            title: it.title ?? null,
          },
        });
        break;
      }
      case "opp.create": {
        const account = accountById.get(it.accountId);
        if (!account) return badTarget("客户", it.accountId);
        const stage = it.stage ?? "identify";
        if (!OPEN_OPP_STAGES.some((s) => s === stage)) {
          problem(`商机「${it.title}」不能直接从 ${OPP_STAGE_CN[stage]} 阶段创建，请从识别/技术交流/方案与报价/样品POC/商务合同/交付执行开始`);
          break;
        }
        if (!once(`opp.create:${it.accountId}:${it.title}`)) break;
        push({
          kind: "opp.create",
          label: `新建商机「${it.title}」· ${account.name}`,
          opp: {
            accountId: it.accountId,
            title: it.title,
            stage,
            amountCny: it.amountCny ?? null,
          },
        });
        break;
      }
      case "opp.stage": {
        const opp = oppById.get(it.id);
        if (!opp) return badTarget("商机", it.id);
        if (!once(`opp.stage:${it.id}`)) break;
        const lostReason = it.lostReason ?? null;
        push({
          kind: "opp.stage",
          id: opp.id,
          title: opp.title,
          stage: it.stage,
          lostReason,
          label: `商机移阶段：「${opp.title}」→ ${OPP_STAGE_CN[it.stage]}${it.stage === "lost" && !lostReason ? "（未填原因）" : ""}`,
          before: { stage: opp.stage },
        });
        break;
      }
      case "activity.log": {
        let subjectName = "";
        if (it.subjectType === "opportunity") {
          const opp = oppById.get(it.subjectId);
          if (!opp) return badTarget("商机", it.subjectId);
          subjectName = opp.title;
        } else {
          const account = accountById.get(it.subjectId);
          if (!account) return badTarget("客户", it.subjectId);
          subjectName = account.name;
        }
        if (!once(`activity.log:${it.subjectType}:${it.subjectId}`)) break;
        const activityKind = it.activityKind ?? "other";
        const summaryShort = short(it.summary, 24);
        push({
          kind: "activity.log",
          label: `记录一次沟通：${ACTIVITY_KIND_CN[activityKind]}·${subjectName}${it.subjectType === "account" ? `(${summaryShort})` : ""}`,
          subjectType: it.subjectType,
          subjectId: it.subjectId,
          activityKind,
          summary: it.summary,
          nextActionAt: it.nextActionAt ?? null,
        });
        break;
      }
      case "supplier.create": {
        if (!once(`supplier.create:${it.name}`)) break;
        push({
          kind: "supplier.create",
          label: `新建供应商「${it.name}」${it.category ? `· ${it.category}` : ""}`,
          supplier: {
            name: it.name,
            category: it.category ?? null,
            contactName: it.contactName ?? null,
          },
        });
        break;
      }
      case "sample.create": {
        if (!it.opportunityId && !it.accountId) {
          problem(`记样品「${it.title}」需要关联一个真实商机或客户`);
          break;
        }
        let subjectName = "";
        let subjectKey = "";
        if (it.opportunityId) {
          const opp = oppById.get(it.opportunityId);
          if (!opp) return badTarget("商机", it.opportunityId);
          subjectName = opp.title;
          subjectKey = `opp:${opp.id}`;
        } else if (it.accountId) {
          const account = accountById.get(it.accountId);
          if (!account) return badTarget("客户", it.accountId);
          subjectName = account.name;
          subjectKey = `account:${account.id}`;
        }
        if (!once(`sample.create:${subjectKey}:${it.title}`)) break;
        const status = it.status ?? "sent";
        push({
          kind: "sample.create",
          label: `记样品「${it.title}」· ${subjectName} · ${SAMPLE_STATUS_CN[status]}`,
          sample: {
            title: it.title,
            opportunityId: it.opportunityId ?? null,
            accountId: it.accountId ?? null,
            status,
            sentAt: it.sentAt ?? null,
          },
        });
        break;
      }
      case "supplier.rfq": {
        const supplier = supplierById.get(it.supplierId);
        if (!supplier) return badTarget("供应商", it.supplierId);
        if (!once(`supplier.rfq:${it.supplierId}:${it.item}`)) break;
        const status = it.status ?? "asking";
        const pricePart = it.priceCny != null ? ` ¥${it.priceCny}` : "";
        const deliveryPart = it.deliveryDays != null ? ` 交期${it.deliveryDays}天` : "";
        push({
          kind: "supplier.rfq",
          label: `询价：${it.item} @ ${supplier.name}${pricePart}${deliveryPart}`,
          rfq: {
            supplierId: it.supplierId,
            item: it.item,
            priceCny: it.priceCny ?? null,
            deliveryDays: it.deliveryDays ?? null,
            validUntil: it.validUntil ?? null,
            status,
          },
        });
        break;
      }
      case "supplier.event": {
        const supplier = supplierById.get(it.supplierId);
        if (!supplier) return badTarget("供应商", it.supplierId);
        if (!once(`supplier.event:${it.supplierId}:${it.eventKind}`)) break;
        push({
          kind: "supplier.event",
          label: `记供应商事件：${SUPPLIER_EVENT_KIND_CN[it.eventKind]} · ${short(it.summary, 20)}`,
          supplierEvent: {
            supplierId: it.supplierId,
            eventKind: it.eventKind,
            summary: it.summary,
            impact: it.impact ?? null,
          },
        });
        break;
      }
    }
  }

  if (problems.length > 0) {
    return { ok: false, code: "ask", message: problems.join("；") + "。请调整后重发。" };
  }
  if (steps.length === 0) {
    return { ok: false, code: "ask", message: "这句没有产生可执行的操作。试试：\n· 本周任务全部标完成\n· 记个任务：BD 跟进华电合同，周五前\n· 记个便签：周五带电脑\n· 今天收工" };
  }

  const validated = stepsArraySchema.safeParse(steps);
  if (!validated.success) {
    return { ok: false, code: "error", message: "步骤组装失败（内部错误），请重试或换个说法。" };
  }
  return { ok: true, steps: validated.data };
}

function badTarget(kind: string, id: number): PlanReply {
  return {
    ok: false,
    code: "ask",
    message: `上下文里没有找到对应的${kind}（id=${id}）。看板可能刚被改动，请刷新后重试。`,
  };
}
