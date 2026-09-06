/**
 * CRM 模块共享小工具
 * 目前主要是 activity 记录的副作用：写时间线后，需要同步更新关联客户/商机的最近联系日。
 */
import { eq } from "drizzle-orm";
import { accounts, opportunities, activities } from "@db/schema";
import { dayFmt } from "./helpers";
import type { getDb } from "./queries/connection";

export type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface CrmActivityInput {
  subjectType: "opportunity" | "account";
  subjectId: number;
  kind: string;
  summary: string;
  nextActionAt: string | null;
  happenedAt?: Date;
}

/**
 * 插入一条 CRM 沟通记录，并同步刷新关联主体的最近动作日期。
 * 该函数在 ai.execute 与 crm.activity.create 中复用，保证行为一致。
 */
export async function insertCrmActivity(tx: Tx, input: CrmActivityInput): Promise<void> {
  await tx.insert(activities).values({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    kind: input.kind,
    summary: input.summary,
    nextActionAt: input.nextActionAt,
    happenedAt: input.happenedAt ?? new Date(),
  });

  if (input.subjectType === "opportunity") {
    await tx
      .update(opportunities)
      .set({ lastActivityAt: new Date(), nextActionDue: input.nextActionAt ?? null })
      .where(eq(opportunities.id, input.subjectId));
  } else if (input.subjectType === "account") {
    await tx
      .update(accounts)
      .set({ lastContactAt: input.nextActionAt ?? dayFmt(new Date()), nextActionAt: input.nextActionAt })
      .where(eq(accounts.id, input.subjectId));
  }
}
