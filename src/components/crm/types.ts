export type Account = {
  id: number;
  name: string;
  kind: "company" | "institute" | "lab" | "government" | "other";
  industry: string | null;
  source: string | null;
  stage: string;
};

export type Contact = {
  id: number;
  accountId: number;
  name: string;
  roleInDeal: string | null;
  title: string | null;
  email: string | null;
  wechat: string | null;
  phone: string | null;
};

export type Opportunity = {
  id: number;
  accountId: number;
  title: string;
  stage: string;
  amountCny: string | null;
  probability: number | null;
  expectedClose: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  lastActivityAt: Date | string | null;
  source: string | null;
  techDiscussionDone: boolean;
  proposalSent: boolean;
  sampleSent: boolean;
  pocPassed: boolean;
  ndaSigned: boolean;
  contractSigned: boolean;
  createdAt: Date | string;
};

export type CrmActivity = {
  id: number;
  subjectType: "opportunity" | "account";
  subjectId: number;
  kind: string;
  summary: string;
  nextActionAt: string | null;
  happenedAt: Date;
};

export type Sample = {
  id: number;
  opportunityId: number | null;
  accountId: number | null;
  title: string;
  qtySpec: string | null;
  sentAt: string | null;
  tracking: string | null;
  status: "requested" | "sent" | "testing" | "passed" | "failed" | "retest";
  feedback: string | null;
  followUpAt: string | null;
  createdAt: Date;
};

export type Supplier = {
  id: number;
  name: string;
  category: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactWechat: string | null;
  accountTerms: string | null;
  singleSource: boolean;
  risk: "H" | "M" | "L" | null;
  memo: string | null;
  createdAt: Date;
};

export type Rfq = {
  id: number;
  supplierId: number;
  item: string;
  qty: string | null;
  priceCny: string | null;
  deliveryDays: number | null;
  validUntil: string | null;
  status: "asking" | "comparing" | "chosen" | "dropped";
  memo: string | null;
  createdAt: Date;
};

export type QualityEvent = {
  id: number;
  supplierId: number;
  kind: "delay" | "quality" | "service";
  summary: string;
  impact: string | null;
  resolvedAt: string | null;
  memo: string | null;
  createdAt: Date;
};

export type Doc = {
  id: number;
  subjectType: "account" | "opportunity" | "sample" | "supplier" | "rfq";
  subjectId: number;
  kind: string | null;
  title: string;
  url: string | null;
  version: number;
  createdAt: Date;
};
