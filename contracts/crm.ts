/** 统一「关系」模型的共享常量（前后端共用）
 * v2：所有阶段/角色/状态标签均提供中英双语（中文为主、英文并列，适配面向西方的业务语境） */

/** 5 种关系类型（导航/筛选标签；底层数据分三张表：accounts / suppliers / investors） */
export const REL_TYPES = ["client", "consultant", "partner", "supplier", "investor"] as const;
export type RelationshipType = (typeof REL_TYPES)[number];

export const REL_TYPE_META: Record<
  RelationshipType,
  { label: string; labelEn: string; short: string; table: "account" | "supplier" | "investor" }
> = {
  client: { label: "客户", labelEn: "Client", short: "客", table: "account" },
  consultant: { label: "顾问", labelEn: "Consultant", short: "顾", table: "account" },
  partner: { label: "合作方", labelEn: "Partner", short: "合", table: "account" },
  supplier: { label: "供应商", labelEn: "Supplier", short: "供", table: "supplier" },
  investor: { label: "投资人", labelEn: "Investor", short: "投", table: "investor" },
};

/** 每种类型的阶段流：stages = 🟢 进行中（按顺序），terminal = 🔴 终态（自动归档） */
export const STAGE_FLOW: Record<RelationshipType, { stages: string[]; terminal: string[] }> = {
  client: { stages: ["prospect", "following", "customer"], terminal: ["inactive", "lost"] },
  consultant: { stages: ["identified", "contacting", "engaged"], terminal: ["ended", "dropped"] },
  partner: { stages: ["candidate", "negotiating", "active"], terminal: ["ended", "failed"] },
  supplier: {
    stages: ["prospecting", "contacting", "quoting", "nda", "contract", "executing"],
    terminal: ["completed", "terminated"],
  },
  investor: {
    stages: ["to_contact", "contacted", "deck", "pitched", "dd", "ts", "closing"],
    terminal: ["funded", "declined", "withdrawn"],
  },
};

/** 阶段中文标签（按类型区分，避免同名冲突） */
export const STAGE_LABELS: Record<RelationshipType, Record<string, string>> = {
  client: { prospect: "潜在", following: "跟进中", customer: "已成交", inactive: "停用", lost: "输单" },
  consultant: { identified: "候选", contacting: "接触洽谈", engaged: "合作中", ended: "聘期结束", dropped: "未谈成" },
  partner: { candidate: "候选评估", negotiating: "洽谈方案", active: "合作中", ended: "合作结束", failed: "洽谈未成" },
  supplier: {
    prospecting: "潜在·未接触", contacting: "交流", quoting: "询价", nda: "保密协议", contract: "合同",
    executing: "执行中", completed: "合同结束", terminated: "终止·弃用",
  },
  investor: {
    to_contact: "待触达", contacted: "初步接触", deck: "材料已发", pitched: "路演", dd: "尽调",
    ts: "条款谈判", closing: "交割中", funded: "投资完成", declined: "婉拒", withdrawn: "放弃",
  },
};

/** 阶段英文标签（面向西方语境的行业说法，非直译） */
export const STAGE_LABELS_EN: Record<RelationshipType, Record<string, string>> = {
  client: { prospect: "Prospect", following: "Following", customer: "Customer", inactive: "Inactive", lost: "Lost" },
  consultant: { identified: "Identified", contacting: "Contacting", engaged: "Engaged", ended: "Ended", dropped: "Dropped" },
  partner: { candidate: "Candidate", negotiating: "Negotiating", active: "Active", ended: "Ended", failed: "Failed" },
  supplier: {
    prospecting: "Prospecting", contacting: "Initial contact", quoting: "RFQ / quoting", nda: "NDA",
    contract: "Contract", executing: "In execution", completed: "Completed", terminated: "Terminated",
  },
  investor: {
    to_contact: "To contact", contacted: "Contacted", deck: "Deck sent", pitched: "Pitched", dd: "Due diligence",
    ts: "Term sheet", closing: "Closing", funded: "Funded", declined: "Declined", withdrawn: "Withdrawn",
  },
};

/** 商机阶段（中英） */
export const OPP_STAGE_META: Record<string, { zh: string; en: string }> = {
  identify: { zh: "识别", en: "Identify" },
  tech_discussion: { zh: "技术交流", en: "Tech discussion" },
  proposal_quote: { zh: "方案与报价", en: "Proposal & quote" },
  sample_poc: { zh: "样品/POC 验证", en: "Sample / POC" },
  contract: { zh: "商务与合同", en: "Contract" },
  delivery: { zh: "交付执行", en: "Delivery" },
  won: { zh: "验收回款(Won)", en: "Won" },
  lost: { zh: "输单(Lost)", en: "Lost" },
};

/** 人脉角色（中英） */
export const CONTACT_ROLE_META: Record<string, { zh: string; en: string }> = {
  academic: { zh: "学术", en: "Academic" },
  founder: { zh: "创始人/CEO", en: "Founder / CEO" },
  industryExec: { zh: "产业高管", en: "Industry executive" },
  industrySales: { zh: "行业销售", en: "Industry sales" },
  consultant: { zh: "顾问", en: "Consultant" },
  investor: { zh: "投资人", en: "Investor" },
  retiredExec: { zh: "退休高管", en: "Retired executive" },
  other: { zh: "其他", en: "Other" },
};

/** 人脉外联状态（中英）：领英获客漏斗五档 + 结束 */
export const OUTREACH_STAGE_META: Record<string, { zh: string; en: string }> = {
  toContact: { zh: "待触达", en: "To reach out" },
  invited: { zh: "已邀约", en: "Invited" },
  meeting: { zh: "已约会议", en: "Meeting booked" },
  engaging: { zh: "推进交流", en: "Engaging" },
  signed: { zh: "已签约", en: "Signed (consultant)" },
  closed: { zh: "结束", en: "Closed" },
};

/** 中英并列标签：中文为主，英文在括号内 */
export function dual(zh: string, en?: string): string {
  return en && en !== zh ? `${zh} (${en})` : zh;
}

/** 某类型某阶段的双语标签 */
export function stageLabelDual(type: RelationshipType, stage: string | null | undefined): string {
  if (!stage) return "—";
  const zh = STAGE_LABELS[type]?.[stage] ?? stage;
  const en = STAGE_LABELS_EN[type]?.[stage];
  return dual(zh, en);
}

/** 判断某关系当前是否处于「历史/终态」 */
export function isArchivedStage(type: RelationshipType, stage: string): boolean {
  return STAGE_FLOW[type].terminal.includes(stage);
}

/** 某类型当前阶段在「进行中」顺序里的位置（0 起）；终态返回 stages.length（结果位） */
export function stageIndex(type: RelationshipType, stage: string): number {
  const { stages, terminal } = STAGE_FLOW[type];
  const i = stages.indexOf(stage);
  if (i >= 0) return i;
  return terminal.includes(stage) ? stages.length : 0;
}
