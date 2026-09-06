/* ============================================================================
 * 旧 deals 表 → CRM opportunities 一次性迁移脚本
 * ----------------------------------------------------------------------------
 * 幂等：已存在 tags 含 'legacy' 的同名 opportunity 会跳过。
 * 不删除 deals 表，保留现场。
 *   npx tsx scripts/migrate-deals.ts
 * ==========================================================================*/
import "dotenv/config";
import { eq, like, and } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { deals, accounts, opportunities } from "../db/schema";

const STAGE_MAP: Record<
  "contact" | "proposal" | "quote" | "won",
  typeof opportunities.$inferInsert.stage
> = {
  contact: "identify",
  proposal: "proposal_quote",
  quote: "proposal_quote",
  won: "won",
};

async function migrate() {
  const db = getDb();
  const oldDeals = await db.select().from(deals).orderBy(deals.sortOrder);
  console.log(`发现旧 deals ${oldDeals.length} 条，开始迁移…`);

  let createdAccounts = 0;
  let migratedOpps = 0;
  let skippedOpps = 0;

  for (const deal of oldDeals) {
    // 1) 按 name 查找或创建 account
    let [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.name, deal.name))
      .limit(1);

    if (!account) {
      const [res] = await db.insert(accounts).values({
        name: deal.name,
        kind: "company",
        source: "legacy_deal",
      });
      const accountId = Number(res.insertId);
      [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
      createdAccounts += 1;
    }

    // 2) 幂等：检查同名且 tags 含 legacy 的 opportunity
    const existing = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.title, deal.name),
          like(opportunities.tags, "%legacy%"),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      skippedOpps += 1;
      continue;
    }

    // 3) 插入 opportunity
    await db.insert(opportunities).values({
      title: deal.name,
      accountId: account.id,
      stage: STAGE_MAP[deal.stage as keyof typeof STAGE_MAP] ?? "identify",
      memo: deal.note ?? null,
      tags: "legacy",
    });
    migratedOpps += 1;
  }

  console.log("迁移完成：");
  console.log(`  旧 deals 总数：${oldDeals.length}`);
  console.log(`  新建 accounts：${createdAccounts}`);
  console.log(`  新建 opportunities：${migratedOpps}`);
  console.log(`  跳过（已存在 legacy）：${skippedOpps}`);
  process.exit(0);
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
