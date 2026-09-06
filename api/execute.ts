/**
 * 看板指令助手 · 步骤执行器
 * 输入：ai.plan 产出的 steps（zod 白名单已校验）
 * 行为：整批放进一个事务顺序执行——任一步失败即整体回滚，
 *      绝不留下"执行了一半"的中间状态（这一步代替了逐条撤销）。
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { tasks, risks, notes, events, milestones, activity, accounts, contacts, opportunities, suppliers, samples, rfqs, suppliersQualityEvents } from "@db/schema";
import { stepSchema } from "@contracts/commands";
import type { Step } from "@contracts/commands";
import { dayFmt } from "./helpers";
import { insertCrmActivity } from "./crm-helpers";

export const executeStepsInput = z.object({
  steps: z.array(stepSchema).min(1).max(60),
});

export type ExecuteResult =
  | { ok: true; executed: number }
  | { ok: false; at: number; message: string };

/** 第 at 步（0 基）执行失败，整批事务将回滚 */
class StepError extends Error {
  readonly at: number;
  constructor(at: number, message: string) {
    super(message);
    this.name = "StepError";
    this.at = at;
  }
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function executeSteps(steps: Step[]): Promise<ExecuteResult> {
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < steps.length; i++) {
        await applyStep(tx, steps[i], i);
      }
    });
    return { ok: true, executed: steps.length };
  } catch (err) {
    if (err instanceof StepError) {
      return { ok: false, at: err.at, message: err.message };
    }
    throw err;
  }
}

async function applyStep(tx: Tx, s: Step, at: number): Promise<void> {
  switch (s.kind) {
    case "task.done":
      await ensureAffected(
        tx
          .update(tasks)
          .set(
            s.done
              ? { done: true, completedAt: new Date(), completedDay: s.day }
              : { done: false, completedAt: null, completedDay: null },
          )
          .where(eq(tasks.id, s.id)),
        at,
        "任务已不存在",
      );
      break;

    case "task.update": {
      const patch: Partial<typeof tasks.$inferInsert> = {};
      if (s.patch.title !== undefined) patch.title = s.patch.title;
      if (s.patch.track !== undefined) patch.track = s.patch.track;
      if (s.patch.priority !== undefined) patch.priority = s.patch.priority;
      if (s.patch.dueDate !== undefined) patch.dueDate = s.patch.dueDate;
      await ensureAffected(
        tx.update(tasks).set(patch).where(eq(tasks.id, s.id)),
        at,
        "任务已不存在",
      );
      break;
    }

    case "task.create":
      await tx.insert(tasks).values({
        title: s.task.title,
        track: s.task.track,
        priority: s.task.priority,
        dueDate: s.task.dueDate,
        weekOf: s.weekOf,
      });
      break;

    case "task.remove":
      await ensureAffected(
        tx.delete(tasks).where(eq(tasks.id, s.id)),
        at,
        "任务已不存在",
      );
      break;

    /** 结转 = 把未完成任务移到目标周（其 weekOf 直接改写） */
    case "task.carry":
      await ensureAffected(
        tx.update(tasks).set({ weekOf: s.targetWeekOf }).where(eq(tasks.id, s.id)),
        at,
        "任务已不存在",
      );
      break;

    case "risk.create":
      await tx.insert(risks).values({
        title: s.risk.title,
        detail: s.risk.detail,
        needFrom: s.risk.needFrom,
        level: s.risk.level,
      });
      break;

    case "risk.resolve":
      await ensureAffected(
        tx.update(risks).set({ resolved: s.resolved }).where(eq(risks.id, s.id)),
        at,
        "风险已不存在",
      );
      break;

    case "risk.remove":
      await ensureAffected(
        tx.delete(risks).where(eq(risks.id, s.id)),
        at,
        "风险已不存在",
      );
      break;

    case "note.create":
      await tx.insert(notes).values({ content: s.content });
      break;

    case "note.remove":
      await ensureAffected(
        tx.delete(notes).where(eq(notes.id, s.id)),
        at,
        "便签已不存在",
      );
      break;

    case "event.create":
      await tx.insert(events).values({
        date: s.event.date,
        title: s.event.title,
        kind: s.event.kind,
        startMin: s.event.startMin,
        endMin: s.event.endMin,
        location: s.event.location,
      });
      break;

    case "milestone.create":
      await tx.insert(milestones).values({
        title: s.milestone.title,
        startDate: s.milestone.startDate,
        targetDate: s.milestone.targetDate,
      });
      break;

    case "offwork.set":
      await tx
        .insert(activity)
        .values({ day: s.day, offworkMin: s.minutes })
        .onDuplicateKeyUpdate({ set: { offworkMin: s.minutes } });
      break;

    case "account.create":
      await tx.insert(accounts).values({
        name: s.account.name,
        kind: s.account.kind,
        industry: s.account.industry,
        source: s.account.source,
      });
      break;

    case "contact.add":
      await tx.insert(contacts).values({
        accountId: s.contact.accountId,
        name: s.contact.name,
        roleInDeal: s.contact.roleInDeal,
        title: s.contact.title,
      });
      break;

    case "opp.create":
      await tx.insert(opportunities).values({
        accountId: s.opp.accountId,
        title: s.opp.title,
        stage: s.opp.stage,
        amountCny: s.opp.amountCny != null ? String(s.opp.amountCny) : null,
      });
      break;

    case "opp.stage": {
      const [existing] = await tx
        .select({ id: opportunities.id, stage: opportunities.stage })
        .from(opportunities)
        .where(eq(opportunities.id, s.id))
        .limit(1);
      if (!existing) throw new StepError(at, "商机已不存在");
      const today = dayFmt(new Date());
      await tx
        .update(opportunities)
        .set({
          stage: s.stage,
          wonAt: s.stage === "won" ? today : undefined,
          lostReason: s.stage === "lost" ? (s.lostReason ?? null) : s.stage === "won" ? null : undefined,
        })
        .where(eq(opportunities.id, s.id));
      break;
    }

    case "activity.log": {
      await insertCrmActivity(tx, {
        subjectType: s.subjectType,
        subjectId: s.subjectId,
        kind: s.activityKind,
        summary: s.summary,
        nextActionAt: s.nextActionAt,
        happenedAt: new Date(),
      });
      break;
    }

    case "supplier.create":
      await tx.insert(suppliers).values({
        name: s.supplier.name,
        category: s.supplier.category,
        contactName: s.supplier.contactName,
      });
      break;

    case "sample.create":
      await tx.insert(samples).values({
        title: s.sample.title,
        opportunityId: s.sample.opportunityId,
        accountId: s.sample.accountId,
        status: s.sample.status,
        sentAt: s.sample.sentAt,
      });
      break;

    case "supplier.rfq":
      await tx.insert(rfqs).values({
        supplierId: s.rfq.supplierId,
        item: s.rfq.item,
        priceCny: s.rfq.priceCny != null ? String(s.rfq.priceCny) : null,
        deliveryDays: s.rfq.deliveryDays,
        validUntil: s.rfq.validUntil,
        status: s.rfq.status,
      });
      break;

    case "supplier.event":
      await tx.insert(suppliersQualityEvents).values({
        supplierId: s.supplierEvent.supplierId,
        kind: s.supplierEvent.eventKind,
        summary: s.supplierEvent.summary,
        impact: s.supplierEvent.impact,
      });
      break;
  }
}

/** update/delete 影响行数为 0 说明目标已被并发改动，抛出以回滚整批 */
async function ensureAffected<T extends readonly unknown[]>(
  p: Promise<T>,
  at: number,
  message: string,
): Promise<void> {
  const [res] = await p;
  const affected =
    res && typeof res === "object" && "affectedRows" in res
      ? (res as { affectedRows: number }).affectedRows
      : 1;
  if (affected === 0) throw new StepError(at, message);
}
