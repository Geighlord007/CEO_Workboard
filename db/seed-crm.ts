/* ============================================================================
 * CRM 演示数据一键重建
 * ----------------------------------------------------------------------------
 * 会先清空 CRM 相关表，再写入一套连贯的示例数据（日期相对今天）。
 * 可重复运行。
 *   npx tsx db/seed-crm.ts
 * ==========================================================================*/
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import {
  accounts,
  contacts,
  opportunities,
  activities,
  samples,
  suppliers,
  rfqs,
  suppliersQualityEvents,
  docs,
} from "./schema";

/* ---------- 日期工具（本地时区，YYYY-MM-DD） ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const TODAY = new Date();
const YESTERDAY = fmt(addDays(TODAY, -1));
const TOMORROW = fmt(addDays(TODAY, 1));
const THREE_DAYS_AGO = fmt(addDays(TODAY, -3));

async function seedCrm() {
  const db = getDb();

  console.warn("⚠️  即将清空 CRM 表并重建演示数据（按 Ctrl+C 取消）…");
  // 按依赖顺序清空：子表 → 父表
  await db.delete(docs);
  await db.delete(suppliersQualityEvents);
  await db.delete(rfqs);
  await db.delete(samples);
  await db.delete(activities);
  await db.delete(opportunities);
  await db.delete(contacts);
  await db.delete(accounts);
  await db.delete(suppliers);
  console.log("CRM 表已清空。");

  /* ============ 1. 机构 ============ */
  await db.insert(accounts).values([
    { name: "北科生物", kind: "company", industry: "合成生物", location: "上海", source: "展会" },
    { name: "华东智造", kind: "company", industry: "合成生物", location: "苏州", source: "转介绍" },
  ]);
  const accountRows = await db.select().from(accounts);
  const beiKe = accountRows.find((a) => a.name === "北科生物")!;
  const huaDong = accountRows.find((a) => a.name === "华东智造")!;

  /* ============ 2. 联系人 ============ */
  await db.insert(contacts).values([
    { accountId: beiKe.id, name: "北科-张工", roleInDeal: "techContact" },
    { accountId: beiKe.id, name: "北科-李总", roleInDeal: "decisionMaker" },
    { accountId: huaDong.id, name: "华东-王老师", roleInDeal: "procurement" },
  ]);

  /* ============ 3. 商机 ============ */
  await db.insert(opportunities).values([
    {
      accountId: beiKe.id,
      title: "酶法合成项目",
      stage: "tech_discussion",
      amountCny: "500000",
      nextActionDue: TOMORROW,
      techDiscussionDone: true,
    },
    {
      accountId: beiKe.id,
      title: "引物与菌株供应",
      stage: "proposal_quote",
      amountCny: "120000",
      sampleSent: true,
    },
    {
      accountId: huaDong.id,
      title: "菌株鉴定服务",
      stage: "identify",
    },
  ]);
  const oppRows = await db.select().from(opportunities);
  const meiFa = oppRows.find((o) => o.title === "酶法合成项目")!;
  const yinWu = oppRows.find((o) => o.title === "引物与菌株供应")!;

  /* ============ 4. 沟通/动作 ============ */
  await db.insert(activities).values([
    {
      subjectType: "opportunity",
      subjectId: meiFa.id,
      kind: "meeting",
      summary: "北科技术交流：确认酶法合成路线与交付节点",
      happenedAt: new Date(`${YESTERDAY}T10:00:00`),
    },
    {
      subjectType: "opportunity",
      subjectId: meiFa.id,
      kind: "wechat",
      summary: "北科微信确认需求：客户已反馈技术参数，待明天同步内部",
      happenedAt: new Date(`${fmt(TODAY)}T14:00:00`),
      nextActionAt: TOMORROW,
    },
    {
      subjectType: "account",
      subjectId: huaDong.id,
      kind: "call",
      summary: "华东初步电话：王老师介绍菌株鉴定需求，待发送资料",
      happenedAt: new Date(`${THREE_DAYS_AGO}T09:30:00`),
    },
    {
      subjectType: "opportunity",
      subjectId: yinWu.id,
      kind: "meeting",
      summary: "北科方案评审：引物与菌株供应方案内部评审通过",
      happenedAt: new Date(`${fmt(TODAY)}T16:00:00`),
    },
  ]);

  /* ============ 5. 样品 ============ */
  await db.insert(samples).values([
    {
      accountId: beiKe.id,
      opportunityId: meiFa.id,
      title: "酶法合成样品",
      status: "sent",
      sentAt: fmt(TODAY),
    },
  ]);

  /* ============ 6. 供应商、RFQ、质量事件 ============ */
  await db.insert(suppliers).values([
    { name: "擎科生物", category: "gene_synthesis" },
    { name: "华大测序", category: "sequencing" },
  ]);
  const supplierRows = await db.select().from(suppliers);
  const qingKe = supplierRows.find((s) => s.name === "擎科生物")!;
  const huaDa = supplierRows.find((s) => s.name === "华大测序")!;

  await db.insert(rfqs).values([
    { supplierId: qingKe.id, item: "引物合成", priceCny: "3500" },
    { supplierId: huaDa.id, item: "全基因组测序", priceCny: "5000" },
  ]);

  await db.insert(suppliersQualityEvents).values([
    {
      supplierId: qingKe.id,
      kind: "delay",
      summary: "擎科引物交付延期 2 天",
      resolvedAt: fmt(TODAY),
    },
  ]);

  /* ============ 7. 文档外链 ============ */
  await db.insert(docs).values([
    {
      subjectType: "opportunity",
      subjectId: meiFa.id,
      kind: "proposal",
      title: "北科-酶法合成项目 proposal",
      url: "https://drive.google.com/file/d/demo-proposal-beike",
      version: 2,
    },
    {
      subjectType: "opportunity",
      subjectId: meiFa.id,
      kind: "quote",
      title: "北科-酶法合成项目 报价",
      url: "https://drive.google.com/file/d/demo-quote-beike",
      version: 1,
    },
  ]);

  /* ============ 8. 统计 ============ */
  const counts = {
    accounts: await db.select({ cnt: sql<number>`count(*)` }).from(accounts),
    contacts: await db.select({ cnt: sql<number>`count(*)` }).from(contacts),
    opportunities: await db.select({ cnt: sql<number>`count(*)` }).from(opportunities),
    activities: await db.select({ cnt: sql<number>`count(*)` }).from(activities),
    samples: await db.select({ cnt: sql<number>`count(*)` }).from(samples),
    suppliers: await db.select({ cnt: sql<number>`count(*)` }).from(suppliers),
    rfqs: await db.select({ cnt: sql<number>`count(*)` }).from(rfqs),
    qualityEvents: await db.select({ cnt: sql<number>`count(*)` }).from(suppliersQualityEvents),
    docs: await db.select({ cnt: sql<number>`count(*)` }).from(docs),
  };

  console.log("CRM 演示数据已写入，各表行数：");
  console.log(`  accounts        ${counts.accounts[0].cnt}`);
  console.log(`  contacts        ${counts.contacts[0].cnt}`);
  console.log(`  opportunities   ${counts.opportunities[0].cnt}`);
  console.log(`  activities      ${counts.activities[0].cnt}`);
  console.log(`  samples         ${counts.samples[0].cnt}`);
  console.log(`  suppliers       ${counts.suppliers[0].cnt}`);
  console.log(`  rfqs            ${counts.rfqs[0].cnt}`);
  console.log(`  quality_events  ${counts.qualityEvents[0].cnt}`);
  console.log(`  docs            ${counts.docs[0].cnt}`);
  process.exit(0);
}

seedCrm().catch((e) => {
  console.error(e);
  process.exit(1);
});
