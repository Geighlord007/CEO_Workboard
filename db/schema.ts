import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  int,
  tinyint,
  boolean,
  decimal,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
/** 邮箱+密码登录的密码哈希（scrypt: salt:hash），未设置则为 NULL */
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* ============================================================================
 * 每周任务控制台 · 业务数据表
 * 说明：这是单租户工作台（你本人使用），数据不按用户隔离；
 * 所有日期字段统一存本地日期字符串 "YYYY-MM-DD"，避免时区换算问题。
 * ==========================================================================*/

/** 业务线枚举：BD 拓展 / 战略与市场调研 / 供应商协调 / CEO 支持 */
export const TRACKS = ["bd", "research", "supplier", "ceo"] as const;

/** 任务表：weekly 任务清单，weekOf = 所属周的周一日期 */
export const tasks = mysqlTable("tasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  track: mysqlEnum("track", TRACKS).notNull(),
  /** 优先级：0=P0 紧急，1=P1 正常，2=P2 可缓 */
  priority: tinyint("priority").notNull().default(1),
  done: boolean("done").notNull().default(false),
  /** 完成时刻（服务器时间，仅作记录） */
  completedAt: timestamp("completedAt"),
  /** 完成时的本地日期（前端传入），热力图/趋势图按它聚合 */
  completedDay: varchar("completedDay", { length: 10 }),
  /** 截止日期 YYYY-MM-DD，可空 */
  dueDate: varchar("dueDate", { length: 10 }),
  /** 关联文档链接（Google Doc / Slide / Drive） */
  link: varchar("link", { length: 1000 }),
  /** 所属周的周一日期 YYYY-MM-DD */
  weekOf: varchar("weekOf", { length: 10 }).notNull(),
  sortOrder: int("sortOrder").notNull().default(0),
  /** CRM 多态挂接：所属对象（opportunity/account/supplier…），NULL=普通个人周任务 */
  subjectType: varchar("subjectType", { length: 24 }),
  subjectId: int("subjectId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Task = typeof tasks.$inferSelect;

/** 日历事项表：会议 / 里程碑 / 截止日 / 出差，同时驱动月历红点和今日日程 */
export const events = mysqlTable("events", {
  id: serial("id").primaryKey(),
  date: varchar("date", { length: 10 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  kind: mysqlEnum("kind", ["meeting", "milestone", "deadline", "trip", "other"])
    .notNull()
    .default("meeting"),
  /** 开始时间（距零点分钟数），空 = 全天事项 */
  startMin: int("startMin"),
  endMin: int("endMin"),
  location: varchar("location", { length: 255 }),
  /** CRM 多态挂接：拜访/评审等可归属商机/客户 */
  subjectType: varchar("subjectType", { length: 24 }),
  subjectId: int("subjectId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Event = typeof events.$inferSelect;

/** 关键节点表：倒计时目标（董事会、投标截止、交付日…） */
export const milestones = mysqlTable("milestones", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  /** 目标日 */
  targetDate: varchar("targetDate", { length: 10 }).notNull(),
  /** 进度点阵的起算日 */
  startDate: varchar("startDate", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Milestone = typeof milestones.$inferSelect;

/** 便签表 */
export const notes = mysqlTable("notes", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Note = typeof notes.$inferSelect;

/** 风险与阻塞表（老板最关心的红灯项） */
export const risks = mysqlTable("risks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  /** 卡在哪 */
  detail: text("detail"),
  /** 需要谁支持 */
  needFrom: varchar("needFrom", { length: 255 }),
  level: mysqlEnum("level", ["high", "mid", "low"]).notNull().default("mid"),
  resolved: boolean("resolved").notNull().default(false),
  /** CRM 多态挂接：商机/供应商相关风险 */
  subjectType: varchar("subjectType", { length: 24 }),
  subjectId: int("subjectId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Risk = typeof risks.$inferSelect;

/** BD 客户 pipeline 表：初谈 → 方案 → 报价 → 签约 */
export const deals = mysqlTable("deals", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  stage: mysqlEnum("stage", ["contact", "proposal", "quote", "won"])
    .notNull()
    .default("contact"),
  note: varchar("note", { length: 500 }),
  sortOrder: int("sortOrder").notNull().default(0),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Deal = typeof deals.$inferSelect;

/** 快捷入口表（Slack / Gmail / Drive…） */
export const links = mysqlTable("links", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 100 }).notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Link = typeof links.$inferSelect;

/** 每日活动表：打卡强度手动覆盖 + 收工时间 */
export const activity = mysqlTable("activity", {
  id: serial("id").primaryKey(),
  day: varchar("day", { length: 10 }).notNull().unique(),
  /** 手动覆盖强度 0-3；为空时按当天完成任务数自动映射 */
  level: tinyint("level"),
  /** 收工时间（距零点分钟数），收工散点图数据源 */
  offworkMin: int("offworkMin"),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Activity = typeof activity.$inferSelect;

/** 键值设置表：老板周报只读链接的分享令牌等（key 是 MySQL 保留字，列名用 k） */
export const settings = mysqlTable("settings", {
  k: varchar("k", { length: 100 }).primaryKey(),
  v: text("v"),
});

/* ============================================================================
 * CRM 模块（PRD 11）· 单写者(总助) + CEO 只读 · 项目/定制服务制
 * 日期仍存 YYYY-MM-DD 字符串；金额单位人民币（分位 decimal）。
 * ==========================================================================*/

/** 关系层阶段（客户/顾问/合作方 三类共用；🔴 终态 = 自动归档） */
export const ACCOUNT_STAGES = [
  // 客户 Client
  "prospect", "following", "customer", "inactive", "lost",
  // 顾问 Consultant
  "identified", "contacting", "engaged", "ended", "dropped",
  // 合作方 Partner
  "candidate", "negotiating", "active", "failed",
] as const;

/** accounts 表的关系类型（供应商、投资人走独立表，保持客户/供应商分开） */
export const ACCOUNT_RELATIONSHIP_TYPES = ["client", "consultant", "partner"] as const;

/** 机构/客户（公司 / 院所 / 实验室…），统一承载「客户/顾问/合作方」三类关系 */
export const accounts = mysqlTable("accounts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** 关系类型：client 客户 / consultant 顾问 / partner 合作方 */
  relationshipType: mysqlEnum("relationshipType", ACCOUNT_RELATIONSHIP_TYPES)
    .notNull()
    .default("client"),
  kind: mysqlEnum("kind", ["company", "institute", "lab", "government", "other"])
    .notNull()
    .default("company"),
  industry: varchar("industry", { length: 64 }),
  stage: mysqlEnum("stage", ACCOUNT_STAGES).notNull().default("prospect"),
  website: varchar("website", { length: 500 }),
  location: varchar("location", { length: 255 }),
  source: varchar("source", { length: 32 }),
  /** 外部同步来源（airtable / sheets / excel …） */
  externalSource: varchar("externalSource", { length: 32 }),
  /** 外部记录 ID（双向同步回写用） */
  externalId: varchar("externalId", { length: 128 }),
  nextActionAt: varchar("nextActionAt", { length: 10 }),
  lastContactAt: varchar("lastContactAt", { length: 10 }),
  aiSummary: text("aiSummary"),
  tags: varchar("tags", { length: 500 }),
  /** 自由备注（旧表导入/日常随手记） */
  memo: text("memo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type Account = typeof accounts.$inferSelect;

/** 联系人：隶属 Account，可多角色（决策链画像） */
export const contacts = mysqlTable("contacts", {
  id: serial("id").primaryKey(),
  /** 人脉簿 v1.3：可空 = 允许独立人脉（顾问/退休高管等无机构挂靠） */
  accountId: int("accountId"),
  name: varchar("name", { length: 120 }).notNull(),
  title: varchar("title", { length: 120 }),
  dept: varchar("dept", { length: 120 }),
  /** 决策链角色：scientist/procurement/qa/finance/exec/decisionMaker/techContact */
  roleInDeal: varchar("roleInDeal", { length: 32 }),
  /** 立场：supporter/neutral/blocker/unknown */
  stance: varchar("stance", { length: 16 }),
  /** 影响力 H/M/L */
  influence: varchar("influence", { length: 1 }),
  email: varchar("email", { length: 255 }),
  wechat: varchar("wechat", { length: 120 }),
  phone: varchar("phone", { length: 60 }),
  memo: text("memo"),
  lastContactAt: varchar("lastContactAt", { length: 10 }),
  /** v1.3 人脉簿扩展 */
  linkedinUrl: varchar("linkedinUrl", { length: 255 }),
  /** 人脉角色 code：academic 学术/founder 创始人CEO/industryExec 产业高管/industrySales 行业销售/consultant 顾问/investor 投资人/retiredExec 退休高管/other 其他（双语 label 走文案层） */
  roleType: varchar("roleType", { length: 32 }),
  referral: varchar("referral", { length: 255 }),
  /** 外联状态：toContact 待触达/invited 已邀约/meeting 已约会议/engaging 推进交流/signed 已签约/closed 结束 */
  outreachStage: varchar("outreachStage", { length: 24 }),
  tags: varchar("tags", { length: 500 }),
  emailKind: varchar("emailKind", { length: 16 }),
  externalSource: varchar("externalSource", { length: 32 }),
  externalId: varchar("externalId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Contact = typeof contacts.$inferSelect;

/** 商机 = 项目主线程（项目/定制服务制，不做 SKU） */
export const OPP_STAGES = [
  "identify", // 识别
  "tech_discussion", // 技术交流
  "proposal_quote", // 方案与报价
  "sample_poc", // 样品/POC 验证
  "contract", // 商务与合同
  "delivery", // 交付执行
  "won", // 验收回款(Won)
  "lost", // 输单(必填 reason)
] as const;

export const opportunities = mysqlTable("opportunities", {
  id: serial("id").primaryKey(),
  accountId: int("accountId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  stage: mysqlEnum("stage", OPP_STAGES).notNull().default("identify"),
  /** 项目金额(人民币，报价口径) */
  amountCny: decimal("amountCny", { precision: 14, scale: 2 }),
  /** 手动覆盖成交概率(留空=按阶段默认) */
  probability: tinyint("probability"),
  expectedClose: varchar("expectedClose", { length: 10 }),
  source: varchar("source", { length: 32 }),
  ownerId: int("ownerId").notNull().default(1),
  /** 验证物推进门槛：techDiscussion/proposalSent/sampleSent/pocPassed/ndaSigned/contractSigned */
  techDiscussionDone: boolean("techDiscussionDone").notNull().default(false),
  proposalSent: boolean("proposalSent").notNull().default(false),
  sampleSent: boolean("sampleSent").notNull().default(false),
  pocPassed: boolean("pocPassed").notNull().default(false),
  ndaSigned: boolean("ndaSigned").notNull().default(false),
  contractSigned: boolean("contractSigned").notNull().default(false),
  nextAction: varchar("nextAction", { length: 500 }),
  nextActionDue: varchar("nextActionDue", { length: 10 }),
  lastActivityAt: timestamp("lastActivityAt"),
  lostReason: varchar("lostReason", { length: 255 }),
  wonAt: varchar("wonAt", { length: 10 }),
  tags: varchar("tags", { length: 500 }),
  memo: text("memo"),
  externalSource: varchar("externalSource", { length: 32 }),
  externalId: varchar("externalId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type Opportunity = typeof opportunities.$inferSelect;

/** 沟通/动作 = 时间线（防"冷掉"） */
export const activities = mysqlTable("activities", {
  id: serial("id").primaryKey(),
  /** account|opportunity|supplier */
  subjectType: varchar("subjectType", { length: 24 }).notNull(),
  subjectId: int("subjectId").notNull(),
  /** call/wechat/email/meeting/visit/sample/other */
  kind: varchar("kind", { length: 24 }).notNull().default("other"),
  summary: varchar("summary", { length: 2000 }).notNull(),
  contacts: varchar("contacts", { length: 500 }),
  nextActionAt: varchar("nextActionAt", { length: 10 }),
  happenedAt: timestamp("happenedAt").notNull().defaultNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrmActivity = typeof activities.$inferSelect;

/** 寄样/测试闭环（合成生物成交硬关卡） */
export const SAMPLE_STATUS = ["requested", "sent", "testing", "passed", "failed", "retest"] as const;
export const samples = mysqlTable("samples", {
  id: serial("id").primaryKey(),
  opportunityId: int("opportunityId"),
  accountId: int("accountId"),
  title: varchar("title", { length: 255 }).notNull(),
  qtySpec: varchar("qtySpec", { length: 120 }),
  sentAt: varchar("sentAt", { length: 10 }),
  tracking: varchar("tracking", { length: 120 }),
  status: mysqlEnum("status", SAMPLE_STATUS).notNull().default("requested"),
  feedback: text("feedback"),
  followUpAt: varchar("followUpAt", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Sample = typeof samples.$inferSelect;

/** 供应商阶段 = 合同级推进（单供应商当前一笔合作的旅程；🔴 终态 = 自动归档）
 * prospecting 潜在·未接触（仅建档未接洽）→ contacting 交流 → quoting 询价 → nda 保密协议 → contract 合同 → executing 执行中
 * 终态：completed 合同结束(正常✓) / terminated 终止·弃用(提前结束) */
export const SUPPLIER_STAGES = [
  "prospecting", "contacting", "quoting", "nda", "contract", "executing",
  "completed", "terminated",
] as const;

/** 供应商（独立于客户，采购侧；含服务商/检测/注册/实验/CDMO/设备仪器）
 * 一条记录 = 一家供应商 + 其当前一笔合作的推进 */
export const suppliers = mysqlTable("suppliers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** contacting 交流 / quoting 询价 / nda 保密协议 / contract 合同 / executing 执行中 / completed 合同结束 / terminated 终止·弃用 */
  stage: mysqlEnum("stage", SUPPLIER_STAGES).notNull().default("contacting"),
  /** gene_synthesis/primer/sequencing/reagent/consumable/equipment/cdmo/logistics/other */
  category: varchar("category", { length: 32 }),
  contactName: varchar("contactName", { length: 120 }),
  contactPhone: varchar("contactPhone", { length: 60 }),
  contactWechat: varchar("contactWechat", { length: 120 }),
  /** 合同/项目金额（人民币），推进卡与汇总用它 */
  amountCny: decimal("amountCny", { precision: 14, scale: 2 }),
  /** 合同/项目开始日期 */
  startDate: varchar("startDate", { length: 10 }),
  /** 预计/实际结束日期 */
  endDate: varchar("endDate", { length: 10 }),
  accountTerms: varchar("accountTerms", { length: 120 }),
  singleSource: boolean("singleSource").notNull().default(false),
  risk: varchar("risk", { length: 1 }),
  tags: varchar("tags", { length: 500 }),
  memo: text("memo"),
  externalSource: varchar("externalSource", { length: 32 }),
  externalId: varchar("externalId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type Supplier = typeof suppliers.$inferSelect;

/** 投资人/VC 阶段（每轮融资独立：新一轮=从「待触达」重新起跑；🔴 终态=归档）
 * to_contact 待触达(建档/上轮遗留) → contacted 已接触 → deck 发资料 → pitched 路演 → dd 尽调 → ts TS → closing 交割 → funded 已投
 * 终态：declined 放弃(带原因tag，下轮可重启) / withdrawn 撤回 */
export const INVESTOR_STAGES = [
  "to_contact", "contacted", "deck", "pitched", "dd", "ts", "closing",
  "funded", "declined", "withdrawn",
] as const;

/** 投资人 / VC（融资侧，独立于客户和供应商） */
export const investors = mysqlTable("investors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** 机构/基金名 */
  firm: varchar("firm", { length: 255 }),
  /** 融资轮次标签（每轮独立，如 seed-2025 / seed-2026） */
  round: varchar("round", { length: 32 }),
  /** stage=当前轮次推进状态；旧表无状态记录的行导入为 to_contact（不冒充已接触） */
  stage: mysqlEnum("stage", INVESTOR_STAGES).notNull().default("contacted"),
  contactName: varchar("contactName", { length: 120 }),
  contactTitle: varchar("contactTitle", { length: 120 }),
  contactEmail: varchar("contactEmail", { length: 255 }),
  /** verified / unverified / linkedin(该行邮箱列实为LinkedIn) */
  emailKind: varchar("emailKind", { length: 16 }),
  contactLinkedin: varchar("contactLinkedin", { length: 500 }),
  lastContactAt: varchar("lastContactAt", { length: 10 }),
  nextAction: varchar("nextAction", { length: 500 }),
  /** 标签：VC / 产业资本 / 政府基金 / 天使 / 银行（逗号分隔） */
  tags: varchar("tags", { length: 500 }),
  memo: text("memo"),
  externalSource: varchar("externalSource", { length: 32 }),
  externalId: varchar("externalId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type Investor = typeof investors.$inferSelect;

/** 询价比价 */
export const RFQ_STATUS = ["asking", "comparing", "chosen", "dropped"] as const;
export const rfqs = mysqlTable("rfqs", {
  id: serial("id").primaryKey(),
  supplierId: int("supplierId").notNull(),
  item: varchar("item", { length: 255 }).notNull(),
  qty: varchar("qty", { length: 120 }),
  priceCny: decimal("priceCny", { precision: 12, scale: 2 }),
  deliveryDays: int("deliveryDays"),
  validUntil: varchar("validUntil", { length: 10 }),
  status: mysqlEnum("status", RFQ_STATUS).notNull().default("asking"),
  memo: varchar("memo", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Rfq = typeof rfqs.$inferSelect;

/** 交期/质量事件 */
export const suppliersQualityEvents = mysqlTable("quality_events", {
  id: serial("id").primaryKey(),
  supplierId: int("supplierId").notNull(),
  /** delay/quality/service */
  kind: varchar("kind", { length: 16 }).notNull(),
  summary: varchar("summary", { length: 1000 }).notNull(),
  impact: varchar("impact", { length: 500 }),
  resolvedAt: varchar("resolvedAt", { length: 10 }),
  memo: varchar("memo", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SupplierQualityEvent = typeof suppliersQualityEvents.$inferSelect;

/** 文档外链（统一挂接，带版本，找最新版用） */
export const DOC_KINDS = [
  "proposal", "quote", "nda", "contract", "coa", "report", "caseStudy", "qualification", "other",
] as const;
export const docs = mysqlTable("docs", {
  id: serial("id").primaryKey(),
  /** account|opportunity|sample|supplier|rfq */
  subjectType: varchar("subjectType", { length: 24 }).notNull(),
  subjectId: int("subjectId").notNull(),
  kind: varchar("kind", { length: 24 }),
  title: varchar("title", { length: 255 }).notNull(),
  url: varchar("url", { length: 1000 }),
  version: int("version").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Doc = typeof docs.$inferSelect;

/* ============ 情报/观察模块 v1.3（CRM 一环；只读底库，未来每周 Agent 按 cbUrl upsert） ============ */

/** 公司库（外部公司/行业地图）：Crunchbase 等公开快照，非运营跟进对象 */
export const companyLibrary = mysqlTable("company_library", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  nameNormalized: varchar("nameNormalized", { length: 255 }),
  domain: varchar("domain", { length: 255 }),
  industries: varchar("industries", { length: 1000 }),
  description: text("description"),
  hq: varchar("hq", { length: 255 }),
  foundedYear: varchar("foundedYear", { length: 8 }),
  employeesBucket: varchar("employeesBucket", { length: 64 }),
  totalFundingUsd: decimal("totalFundingUsd", { precision: 18, scale: 2 }),
  /** 融资轮次数（由 funding_events 汇总的冗余列，便于列表排序筛选） */
  roundCount: int("roundCount"),
  lastFundingDate: varchar("lastFundingDate", { length: 10 }),
  lastFundingType: varchar("lastFundingType", { length: 64 }),
  ipoStatus: varchar("ipoStatus", { length: 64 }),
  acquiredBy: varchar("acquiredBy", { length: 255 }),
  acquiredPrice: varchar("acquiredPrice", { length: 64 }),
  acquiredDate: varchar("acquiredDate", { length: 10 }),
  /** 去重/未来 upsert 主键依据 */
  cbUrl: varchar("cbUrl", { length: 500 }),
  enzymeTag: varchar("enzymeTag", { length: 16 }),
  sliceTags: varchar("sliceTags", { length: 500 }),
  snapshotDate: varchar("snapshotDate", { length: 10 }),
  source: varchar("source", { length: 64 }),
  externalId: varchar("externalId", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type CompanyLibrary = typeof companyLibrary.$inferSelect;

/** 融资事件库：逐轮融资事件（金额/估值/投资方），按公司查时间线、按投资方搜赛道、定价参照 */
export const fundingEvents = mysqlTable("funding_events", {
  id: serial("id").primaryKey(),
  /** 关联公司库（主表+子表合并形态） */
  companyId: int("companyId"),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  companyCbUrl: varchar("companyCbUrl", { length: 500 }),
  roundType: varchar("roundType", { length: 64 }),
  announcedDate: varchar("announcedDate", { length: 10 }),
  amountUsd: decimal("amountUsd", { precision: 18, scale: 2 }),
  amountOriginal: varchar("amountOriginal", { length: 64 }),
  valuation: varchar("valuation", { length: 255 }),
  leadInvestors: varchar("leadInvestors", { length: 500 }),
  participants: varchar("participants", { length: 500 }),
  pharmaOrNon: varchar("pharmaOrNon", { length: 16 }),
  sliceTags: varchar("sliceTags", { length: 255 }),
  source: varchar("source", { length: 64 }),
  externalId: varchar("externalId", { length: 500 }),
  snapshotDate: varchar("snapshotDate", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FundingEvent = typeof fundingEvents.$inferSelect;
