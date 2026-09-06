/** 前后端共享的看板常量与标签（中文界面文案集中在这里） */

export const TRACK_KEYS = ["bd", "research", "supplier", "ceo"] as const;
export type TrackKey = (typeof TRACK_KEYS)[number];

/** 业务线中文标签 + 短代号（点阵风格用） */
export const TRACK_META: Record<TrackKey, { label: string; short: string }> = {
  bd: { label: "BD 拓展", short: "BD" },
  research: { label: "战略 · 市场调研", short: "RES" },
  supplier: { label: "供应商协调", short: "SUP" },
  ceo: { label: "CEO 支持", short: "CEO" },
};

export const PRIORITY_LABEL = ["P0", "P1", "P2"] as const;

export const EVENT_KIND_LABEL: Record<string, string> = {
  meeting: "会议",
  milestone: "里程碑",
  deadline: "截止日",
  trip: "出差",
  other: "事项",
};

export const STAGE_KEYS = ["contact", "proposal", "quote", "won"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export const STAGE_LABEL: Record<StageKey, string> = {
  contact: "初谈",
  proposal: "方案",
  quote: "报价",
  won: "签约",
};

export const RISK_LEVEL_LABEL: Record<string, string> = {
  high: "高",
  mid: "中",
  low: "低",
};
