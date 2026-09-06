/**
 * 看板指令助手 · 前后端共享的操作定义（纯 zod/类型，不依赖任何运行时模块）
 * -------------------------------------------------------------------------
 * 链路：LLM 返回"意图"(intents) → 服务端依据真实数据展开成"步骤"(steps)
 *      → 前端预览/确认 → 逐条执行/撤销。
 * 这里的 schema 就是安全白名单：LLM 的输出、执行层的入参都只能长这样。
 */
import { z } from "zod";

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const dayStr = z.string().regex(DAY_RE);

/** 与 db 常量对齐的可选项 */
export const CMD_TRACKS = ["bd", "research", "supplier", "ceo"] as const;
export const CMD_RISK_LEVELS = ["high", "mid", "low"] as const;
export const CMD_EVENT_KINDS = ["meeting", "milestone", "deadline", "trip", "other"] as const;

/** CRM 模块命令可选项 */
export const CMD_ACCOUNT_KINDS = ["company", "institute", "lab", "government", "other"] as const;
export const CMD_CONTACT_ROLES = ["scientist", "procurement", "qa", "finance", "exec", "decisionMaker", "techContact"] as const;
export const CMD_ACTIVITY_KINDS = ["call", "wechat", "email", "meeting", "visit", "sample", "other"] as const;
export const CMD_OPP_STAGES = ["identify", "tech_discussion", "proposal_quote", "sample_poc", "contract", "delivery", "won", "lost"] as const;
export const CMD_SAMPLE_STATUS = ["requested", "sent", "testing", "passed", "failed", "retest"] as const;
export const CMD_RFQ_STATUS = ["asking", "comparing", "chosen", "dropped"] as const;
export const CMD_SUPPLIER_EVENT_KINDS = ["delay", "quality", "service"] as const;

const id = z.number().int().positive();
const minutes = z.number().int().min(0).max(1439);

/* ============================================================================
 * 一、意图层（LLM 输出，服务端 zod 白名单）
 * ==========================================================================*/
export const intentsSchema = z.object({
  /** 用户只是询问/信息不足时，LLM 应返回 ask 而非猜测执行 */
  ask: z.string().min(1).max(500).optional(),
  intents: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("task.done"), id, done: z.boolean() }),
        z.object({
          kind: z.literal("task.update"),
          id,
          patch: z
            .object({
              title: z.string().trim().min(1).max(500).optional(),
              track: z.enum(CMD_TRACKS).optional(),
              priority: z.number().int().min(0).max(2).optional(),
              dueDate: dayStr.nullable().optional(),
            })
            .refine((o) => Object.keys(o).length > 0, { message: "patch 不能为空" }),
        }),
        z.object({
          kind: z.literal("task.create"),
          title: z.string().trim().min(1).max(500),
          track: z.enum(CMD_TRACKS).optional(),
          priority: z.number().int().min(0).max(2).optional(),
          dueDate: dayStr.nullish(),
          /** 必须填上下文里给出的 weekOf 之一 */
          weekOf: dayStr.optional(),
        }),
        z.object({ kind: z.literal("task.remove"), id }),
        z.object({ kind: z.literal("task.carry"), id, targetWeekOf: dayStr }),
        z.object({
          kind: z.literal("risk.create"),
          title: z.string().trim().min(1).max(255),
          detail: z.string().max(2000).nullish(),
          needFrom: z.string().max(255).nullish(),
          level: z.enum(CMD_RISK_LEVELS).optional(),
        }),
        z.object({ kind: z.literal("risk.resolve"), id, resolved: z.boolean() }),
        z.object({ kind: z.literal("risk.remove"), id }),
        z.object({ kind: z.literal("note.create"), content: z.string().trim().min(1).max(2000) }),
        z.object({ kind: z.literal("note.remove"), id }),
        z.object({
          kind: z.literal("event.create"),
          date: dayStr,
          title: z.string().trim().min(1).max(255),
          /** 事件类别（不能叫 kind：外层 kind 已被判别式占用） */
          category: z.enum(CMD_EVENT_KINDS).optional(),
          startMin: minutes.nullish(),
          endMin: minutes.nullish(),
          location: z.string().max(255).nullish(),
        }),
        z.object({
          kind: z.literal("milestone.create"),
          title: z.string().trim().min(1).max(255),
          startDate: dayStr.optional(),
          targetDate: dayStr,
        }),
        z.object({ kind: z.literal("offwork.set"), minutes }),
        z.object({
          kind: z.literal("account.create"),
          name: z.string().trim().min(1).max(255),
          accountKind: z.enum(CMD_ACCOUNT_KINDS).optional(),
          industry: z.string().max(64).nullish(),
          source: z.string().max(32).nullish(),
        }),
        z.object({
          kind: z.literal("contact.add"),
          accountId: id,
          name: z.string().trim().min(1).max(120),
          roleInDeal: z.enum(CMD_CONTACT_ROLES).nullish(),
          title: z.string().max(120).nullish(),
        }),
        z.object({
          kind: z.literal("opp.create"),
          accountId: id,
          title: z.string().trim().min(1).max(255),
          stage: z.enum(CMD_OPP_STAGES).optional(),
          amountCny: z.number().min(0).nullish(),
        }),
        z.object({
          kind: z.literal("opp.stage"),
          id,
          stage: z.enum(CMD_OPP_STAGES),
          lostReason: z.string().max(255).nullish(),
        }),
        z.object({
          kind: z.literal("activity.log"),
          subjectType: z.enum(["opportunity", "account"]),
          subjectId: id,
          activityKind: z.enum(CMD_ACTIVITY_KINDS).nullish(),
          summary: z.string().trim().min(1).max(2000),
          nextActionAt: z.string().regex(DAY_RE).nullish(),
        }),
        z.object({
          kind: z.literal("supplier.create"),
          name: z.string().trim().min(1).max(255),
          category: z.string().max(32).nullish(),
          contactName: z.string().max(120).nullish(),
        }),
        z.object({
          kind: z.literal("sample.create"),
          title: z.string().trim().min(1).max(255),
          opportunityId: id.nullish(),
          accountId: id.nullish(),
          status: z.enum(CMD_SAMPLE_STATUS).optional(),
          sentAt: dayStr.nullish(),
        }),
        z.object({
          kind: z.literal("supplier.rfq"),
          supplierId: id,
          item: z.string().trim().min(1).max(255),
          priceCny: z.number().min(0).nullish(),
          deliveryDays: z.number().int().min(0).max(3650).nullish(),
          validUntil: dayStr.nullish(),
          status: z.enum(CMD_RFQ_STATUS).optional(),
        }),
        z.object({
          kind: z.literal("supplier.event"),
          supplierId: id,
          eventKind: z.enum(CMD_SUPPLIER_EVENT_KINDS),
          summary: z.string().trim().min(1).max(1000),
          impact: z.string().max(500).nullish(),
        }),
      ]),
    )
    .max(60)
    .optional(),
});

export type LlmIntents = z.infer<typeof intentsSchema>;

/* ============================================================================
 * 二、步骤层（服务端把意图展开为可预览/执行/撤销的最小单位）
 * 每个步骤自带 label（预览文案）与 before（执行前的原值，撤销用）
 * ==========================================================================*/
export const stepSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("task.done"),
    id,
    title: z.string(),
    weekOf: dayStr,
    done: z.boolean(),
    day: dayStr.nullable(),
    label: z.string(),
    before: z.object({ done: z.boolean(), completedDay: dayStr.nullable() }),
  }),
  z.object({
    kind: z.literal("task.update"),
    id,
    title: z.string(),
    weekOf: dayStr,
    patch: z.object({
      title: z.string().max(500).optional(),
      track: z.enum(CMD_TRACKS).optional(),
      priority: z.number().int().min(0).max(2).optional(),
      dueDate: dayStr.nullable().optional(),
    }),
    label: z.string(),
    before: z.object({
      title: z.string(),
      track: z.enum(CMD_TRACKS),
      priority: z.number(),
      dueDate: dayStr.nullable(),
    }),
  }),
  z.object({
    kind: z.literal("task.create"),
    weekOf: dayStr,
    task: z.object({
      title: z.string().min(1).max(500),
      track: z.enum(CMD_TRACKS),
      priority: z.number().int().min(0).max(2),
      dueDate: dayStr.nullable(),
    }),
    label: z.string(),
  }),
  z.object({
    kind: z.literal("task.remove"),
    id,
    weekOf: dayStr,
    label: z.string(),
    before: z.object({
      title: z.string(),
      track: z.enum(CMD_TRACKS),
      priority: z.number(),
      dueDate: dayStr.nullable(),
      link: z.string().nullable(),
      sortOrder: z.number(),
      done: z.boolean(),
      completedDay: dayStr.nullable(),
    }),
  }),
  z.object({
    kind: z.literal("task.carry"),
    id,
    title: z.string(),
    weekOf: dayStr,
    targetWeekOf: dayStr,
    label: z.string(),
  }),
  z.object({
    kind: z.literal("risk.resolve"),
    id,
    title: z.string(),
    resolved: z.boolean(),
    label: z.string(),
    before: z.object({ resolved: z.boolean() }),
  }),
  z.object({
    kind: z.literal("risk.create"),
    label: z.string(),
    risk: z.object({
      title: z.string().min(1).max(255),
      detail: z.string().nullable(),
      needFrom: z.string().nullable(),
      level: z.enum(CMD_RISK_LEVELS),
    }),
  }),
  z.object({
    kind: z.literal("risk.remove"),
    id,
    label: z.string(),
    before: z.object({
      title: z.string(),
      detail: z.string().nullable(),
      needFrom: z.string().nullable(),
      level: z.enum(CMD_RISK_LEVELS),
      resolved: z.boolean(),
    }),
  }),
  z.object({
    kind: z.literal("note.create"),
    label: z.string(),
    content: z.string().min(1).max(2000),
  }),
  z.object({
    kind: z.literal("note.remove"),
    id,
    label: z.string(),
    before: z.object({ content: z.string(), sortOrder: z.number() }),
  }),
  z.object({
    kind: z.literal("event.create"),
    label: z.string(),
    event: z.object({
      date: dayStr,
      title: z.string().min(1).max(255),
      kind: z.enum(CMD_EVENT_KINDS),
      startMin: minutes.nullable(),
      endMin: minutes.nullable(),
      location: z.string().nullable(),
    }),
  }),
  z.object({
    kind: z.literal("milestone.create"),
    label: z.string(),
    milestone: z.object({
      title: z.string().min(1).max(255),
      startDate: dayStr,
      targetDate: dayStr,
    }),
  }),
  z.object({
    kind: z.literal("offwork.set"),
    day: dayStr,
    minutes,
    label: z.string(),
    before: z.object({ minutes: minutes.nullable() }),
  }),
  z.object({
    kind: z.literal("account.create"),
    label: z.string(),
    account: z.object({
      name: z.string().min(1).max(255),
      kind: z.enum(CMD_ACCOUNT_KINDS),
      industry: z.string().nullable(),
      source: z.string().nullable(),
    }),
  }),
  z.object({
    kind: z.literal("contact.add"),
    label: z.string(),
    contact: z.object({
      accountId: z.number().int().positive(),
      name: z.string().min(1).max(120),
      roleInDeal: z.string().nullable(),
      title: z.string().nullable(),
    }),
  }),
  z.object({
    kind: z.literal("opp.create"),
    label: z.string(),
    opp: z.object({
      accountId: z.number().int().positive(),
      title: z.string().min(1).max(255),
      stage: z.enum(CMD_OPP_STAGES),
      amountCny: z.number().nullable(),
    }),
  }),
  z.object({
    kind: z.literal("opp.stage"),
    label: z.string(),
    id: z.number().int().positive(),
    title: z.string(),
    stage: z.enum(CMD_OPP_STAGES),
    lostReason: z.string().nullable(),
    before: z.object({ stage: z.string() }),
  }),
  z.object({
    kind: z.literal("activity.log"),
    label: z.string(),
    subjectType: z.enum(["opportunity", "account"]),
    subjectId: z.number().int().positive(),
    activityKind: z.enum(CMD_ACTIVITY_KINDS),
    summary: z.string().min(1).max(2000),
    nextActionAt: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("supplier.create"),
    label: z.string(),
    supplier: z.object({
      name: z.string().min(1).max(255),
      category: z.string().max(32).nullable(),
      contactName: z.string().max(120).nullable(),
    }),
  }),
  z.object({
    kind: z.literal("sample.create"),
    label: z.string(),
    sample: z.object({
      title: z.string().min(1).max(255),
      opportunityId: z.number().int().positive().nullable(),
      accountId: z.number().int().positive().nullable(),
      status: z.enum(CMD_SAMPLE_STATUS),
      sentAt: dayStr.nullable(),
    }),
  }),
  z.object({
    kind: z.literal("supplier.rfq"),
    label: z.string(),
    rfq: z.object({
      supplierId: z.number().int().positive(),
      item: z.string().min(1).max(255),
      priceCny: z.number().min(0).nullable(),
      deliveryDays: z.number().int().min(0).max(3650).nullable(),
      validUntil: dayStr.nullable(),
      status: z.enum(CMD_RFQ_STATUS),
    }),
  }),
  z.object({
    kind: z.literal("supplier.event"),
    label: z.string(),
    supplierEvent: z.object({
      supplierId: z.number().int().positive(),
      eventKind: z.enum(CMD_SUPPLIER_EVENT_KINDS),
      summary: z.string().min(1).max(1000),
      impact: z.string().max(500).nullable(),
    }),
  }),
]);

export type Step = z.infer<typeof stepSchema>;

/** 破坏性操作：执行前必须高亮提示 */
export const DESTRUCTIVE_KINDS = new Set<Step["kind"]>([
  "task.remove",
  "risk.remove",
  "note.remove",
]);

export type PlanReply =
  | { ok: true; steps: Step[] }
  | { ok: false; code: "ask" | "error"; message: string };

/** ai.plan 最终响应（not_configured 由路由单独给出） */
export const planReplyGuard = z.union([
  z.object({ ok: z.literal(true), steps: z.array(stepSchema) }),
  z.object({ ok: z.literal(false), code: z.enum(["ask", "error"]), message: z.string() }),
]);
