import {
  CMD_ACCOUNT_KINDS,
  CMD_CONTACT_ROLES,
  CMD_ACTIVITY_KINDS,
  CMD_OPP_STAGES,
} from "@contracts/commands";

export const OPP_STAGE_ORDER = CMD_OPP_STAGES;

export const OPP_STAGE_LABEL: Record<string, string> = {
  identify: "识别",
  tech_discussion: "技术交流",
  proposal_quote: "方案/报价",
  sample_poc: "样品/POC",
  contract: "商务/合同",
  delivery: "交付执行",
  won: "赢单",
  lost: "输单",
};

export const ACCOUNT_KIND_LABEL: Record<(typeof CMD_ACCOUNT_KINDS)[number], string> = {
  company: "企业",
  institute: "研究院所",
  lab: "实验室",
  government: "政府",
  other: "其他",
};

/** 客户/机构生命周期阶段 */
export const ACCOUNT_STAGE_LABEL: Record<string, string> = {
  prospect: "潜在",
  active: "进行中",
  customer: "已成交",
  inactive: "停用",
};

/** 客户来源（已知枚举值中文化，未知显示 '--'） */
export const ACCOUNT_SOURCE_LABEL: Record<string, string> = {
  legacy_deal: "历史商机",
  manual: "手工录入",
  import: "批量导入",
  referral: "转介绍",
  website: "官网",
  exhibition: "展会",
  cold_call: "陌拜",
};

export const CONTACT_ROLE_LABEL: Record<(typeof CMD_CONTACT_ROLES)[number], string> = {
  scientist: "科学家",
  procurement: "采购",
  qa: "质量/QA",
  finance: "财务",
  exec: "高管",
  decisionMaker: "决策人",
  techContact: "技术对接",
};

/** 联系人立场 */
export const CONTACT_STANCE_LABEL: Record<string, string> = {
  supporter: "支持",
  neutral: "中立",
  blocker: "反对",
  unknown: "未知",
};

/** 联系人影响力 */
export const CONTACT_INFLUENCE_LABEL: Record<string, string> = {
  H: "高",
  M: "中",
  L: "低",
};

export const ACTIVITY_KIND_LABEL: Record<(typeof CMD_ACTIVITY_KINDS)[number], string> = {
  call: "电话",
  wechat: "微信",
  email: "邮件",
  meeting: "会议",
  visit: "拜访",
  sample: "样品",
  other: "其他",
};

export const SAMPLE_STATUS = [
  "requested",
  "sent",
  "testing",
  "passed",
  "failed",
  "retest",
] as const;

export const SAMPLE_STATUS_LABEL: Record<(typeof SAMPLE_STATUS)[number], string> = {
  requested: "申请中",
  sent: "已寄出",
  testing: "测试中",
  passed: "通过",
  failed: "失败",
  retest: "复测",
};

export const SAMPLE_STATUS_COLOR: Record<(typeof SAMPLE_STATUS)[number], string> = {
  requested: "var(--n-dim)",
  sent: "#3b82f6",
  testing: "#eab308",
  passed: "#22c55e",
  failed: "#ef4444",
  retest: "#f97316",
};

export const RFQ_STATUS = ["asking", "comparing", "chosen", "dropped"] as const;

export const RFQ_STATUS_LABEL: Record<(typeof RFQ_STATUS)[number], string> = {
  asking: "询价中",
  comparing: "比价中",
  chosen: "已选",
  dropped: "弃用",
};

export const QUALITY_KIND = ["delay", "quality", "service"] as const;

export const QUALITY_KIND_LABEL: Record<(typeof QUALITY_KIND)[number], string> = {
  delay: "交期",
  quality: "质量",
  service: "服务",
};

export const DOC_KIND = [
  "proposal",
  "quote",
  "nda",
  "contract",
  "coa",
  "report",
  "caseStudy",
  "qualification",
  "other",
] as const;

export const DOC_KIND_LABEL: Record<(typeof DOC_KIND)[number], string> = {
  proposal: "方案",
  quote: "报价",
  nda: "NDA",
  contract: "合同",
  coa: "COA",
  report: "报告",
  caseStudy: "案例",
  qualification: "资质",
  other: "其它",
};

/** 供应商类别中文映射（支持大小写，未知/空值返回 '--'） */
export const SUPPLIER_CATEGORY_LABEL: Record<string, string> = {
  gene_synthesis: "基因合成",
  primer: "引物",
  sequencing: "测序",
  reagent: "试剂",
  consumable: "耗材",
  equipment: "设备",
  cdmo: "CDMO",
  logistics: "物流",
  other: "其他",
};

export function supplierCategoryLabel(category: string | null | undefined): string {
  if (!category) return "--";
  return SUPPLIER_CATEGORY_LABEL[category.toLowerCase()] ?? "--";
}

export const SUPPLIER_RISK_LABEL: Record<string, string> = {
  H: "高",
  M: "中",
  L: "低",
};

export const SUPPLIER_RISK_COLOR: Record<string, string> = {
  H: "#ef4444",
  M: "#f97316",
  L: "#22c55e",
};

/** 统一取标签：命中返回中文，空值返回 '未设置'，未知返回 '--' */
export function labelOf(map: Record<string, string>, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "未设置";
  return map[value] ?? "--";
}

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(n || 0);
