/** 统一「关系」模型的共享常量（前后端共用） */

/** 5 种关系类型（导航/筛选标签；底层数据分三张表：accounts / suppliers / investors） */
export const REL_TYPES = ["client", "consultant", "partner", "supplier", "investor"] as const;
export type RelationshipType = (typeof REL_TYPES)[number];

export const REL_TYPE_META: Record<
  RelationshipType,
  { label: string; short: string; table: "account" | "supplier" | "investor" }
> = {
  client: { label: "客户", short: "客", table: "account" },
  consultant: { label: "顾问", short: "顾", table: "account" },
  partner: { label: "合作方", short: "合", table: "account" },
  supplier: { label: "供应商", short: "供", table: "supplier" },
  investor: { label: "投资人", short: "投", table: "investor" },
};

/** 每种类型的阶段流：stages = 🟢 进行中（按顺序），terminal = 🔴 终态（自动归档） */
export const STAGE_FLOW: Record<RelationshipType, { stages: string[]; terminal: string[] }> = {
  client: { stages: ["prospect", "following", "customer"], terminal: ["inactive", "lost"] },
  consultant: { stages: ["identified", "contacting", "engaged"], terminal: ["ended", "dropped"] },
  partner: { stages: ["candidate", "negotiating", "active"], terminal: ["ended", "failed"] },
  supplier: { stages: ["asked", "comparing", "approved"], terminal: ["dropped", "retired"] },
  investor: {
    stages: ["contacted", "deck", "pitched", "dd", "ts", "closing"],
    terminal: ["funded", "declined", "withdrawn"],
  },
};

/** 阶段中文标签（按类型区分，避免同名冲突） */
export const STAGE_LABELS: Record<RelationshipType, Record<string, string>> = {
  client: { prospect: "潜在", following: "跟进中", customer: "已成交", inactive: "停用", lost: "输单" },
  consultant: { identified: "候选", contacting: "接触洽谈", engaged: "合作中", ended: "聘期结束", dropped: "未谈成" },
  partner: { candidate: "候选评估", negotiating: "洽谈方案", active: "合作中", ended: "合作结束", failed: "洽谈未成" },
  supplier: { asked: "询价中", comparing: "比价中", approved: "已准入", dropped: "本轮弃用", retired: "淘汰停用" },
  investor: {
    contacted: "初步接触", deck: "材料已发", pitched: "路演", dd: "尽调", ts: "条款谈判", closing: "交割中",
    funded: "投资完成", declined: "婉拒", withdrawn: "放弃",
  },
};

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
