/**
 * Google Sheets 双向同步接口（v1，服务端侧）
 * 调用方 = Google Apps Script（跑在谷歌侧，能访问公网我们的 HTTPS）。
 * 鉴权：请求头 Authorization: Bearer <SYNC_TOKEN>（与运行环境 SYNC_TOKEN 一致）。
 *
 * 协议：
 *  GET  /api/sync/fetch?since=<ISO>  → 返回 3 张关系表增量（updatedAt > since）全部映射字段
 *  POST /api/sync/commit             → { upserts: [...] } 把表格里改/增的行写回系统
 * 映射：系统内英文 code ↔ 表格中文文案（阶段/类型/类别/风险等），人眼友好、机器可逆。
 * v1 规则：不开放删除；按 wtc_id 认行；wtc_id 为空 = 新建。
 */
import type { Hono, Context } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { asc, eq, gte } from "drizzle-orm";
import { getDb } from "./queries/connection";
import {
  accounts,
  suppliers,
  investors,
} from "@db/schema";
import { STAGE_LABELS } from "@contracts/crm";
import { env } from "./lib/env";

/* ---------------- 中英映射 ---------------- */
const TYPE_ZH: Record<string, string> = {
  client: "客户", consultant: "顾问", partner: "合作方", supplier: "供应商", investor: "投资人",
};
const TYPE_KEY: Record<string, string> = Object.fromEntries(Object.entries(TYPE_ZH).map(([k, v]) => [v, k]));
const KIND_ZH: Record<string, string> = { company: "企业", institute: "研究院所", lab: "实验室", government: "政府", other: "其他" };
const CATEGORY_ZH: Record<string, string> = {
  gene_synthesis: "基因合成", primer: "引物", sequencing: "测序", reagent: "试剂",
  consumable: "耗材", equipment: "设备", cdmo: "CDMO", logistics: "物流", other: "其他",
};
const RISK_ZH: Record<string, string> = { H: "高", M: "中", L: "低" };
const RISK_KEY: Record<string, string> = { 高: "H", 中: "M", 低: "L" };
const CATEGORY_KEY: Record<string, string> = Object.fromEntries(Object.entries(CATEGORY_ZH).map(([k, v]) => [v, k]));
const KIND_KEY: Record<string, string> = Object.fromEntries(Object.entries(KIND_ZH).map(([k, v]) => [v, k]));

function labelsOf(typeKey: string): Record<string, string> {
  return (STAGE_LABELS as Record<string, Record<string, string>>)[typeKey] ?? {};
}
function stageToZh(typeKey: string, key: string): string {
  return labelsOf(typeKey)[key] ?? key;
}
function stageFromZh(typeKey: string, v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  const lab = labelsOf(typeKey);
  for (const [k, zh] of Object.entries(lab)) if (zh === s) return k;
  return s; // 已是 code 则原样返回，让 DB 枚举兜底
}

/* ---------------- 鉴权 ---------------- */
function authed(c: Context): boolean {
  const t = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.header("x-sync-token") ?? "";
  return env.syncToken !== "" && t === env.syncToken;
}
function deny(c: Context) {
  return c.json({ ok: false, error: "同步令牌无效或未配置" }, 401);
}
const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

function accRow(a: typeof accounts.$inferSelect) {
  const typeKey = a.relationshipType;
  return {
    wtc_id: a.id,
    type: TYPE_ZH[typeKey] ?? typeKey,
    name: a.name,
    kind: KIND_ZH[a.kind] ?? a.kind,
    industry: a.industry,
    stage: stageToZh(typeKey, a.stage),
    website: a.website,
    location: a.location,
    source: a.source,
    tags: a.tags,
    nextActionAt: a.nextActionAt,
    lastContactAt: a.lastContactAt,
    external_id: a.externalId,
    updated_at: iso(a.updatedAt),
  };
}
function supRow(s: typeof suppliers.$inferSelect) {
  return {
    wtc_id: s.id,
    name: s.name,
    category: (s.category ? CATEGORY_ZH[s.category] : undefined) ?? s.category,
    contactName: s.contactName,
    contactPhone: s.contactPhone,
    contactWechat: s.contactWechat,
    stage: stageToZh("supplier", s.stage),
    amountCny: s.amountCny != null ? Number(s.amountCny) : null,
    startDate: s.startDate,
    endDate: s.endDate,
    accountTerms: s.accountTerms,
    risk: s.risk ? (RISK_ZH[s.risk] ?? s.risk) : null,
    memo: s.memo,
    external_id: s.externalId,
    updated_at: iso(s.updatedAt),
  };
}
function invRow(i: typeof investors.$inferSelect) {
  return {
    wtc_id: i.id,
    name: i.name,
    firm: i.firm,
    contactName: i.contactName,
    tags: i.tags,
    stage: stageToZh("investor", i.stage),
    memo: i.memo,
    external_id: i.externalId,
    updated_at: iso(i.updatedAt),
  };
}

/* ---------------- 端点 ---------------- */
export async function handleFetch(c: Context) {
  if (!authed(c)) return deny(c);
  const sinceRaw = c.req.query("since");
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : new Date("2000-01-01");
  const db = getDb();
  const [acct, supp, inv] = await Promise.all([
    db.select().from(accounts).where(gte(accounts.updatedAt, since)).orderBy(asc(accounts.id)),
    db.select().from(suppliers).where(gte(suppliers.updatedAt, since)).orderBy(asc(suppliers.id)),
    db.select().from(investors).where(gte(investors.updatedAt, since)).orderBy(asc(investors.id)),
  ]);
  return c.json({ ok: true, tables: { accounts: acct.map(accRow), suppliers: supp.map(supRow), investors: inv.map(invRow) } });
}

export async function handleCommit(c: Context) {
  if (!authed(c)) return deny(c);
  const body = (await c.req.json().catch(() => null)) as
    | { upserts?: { accounts?: unknown[]; suppliers?: unknown[]; investors?: unknown[] } }
    | null;
  if (!body || !body.upserts) return c.json({ ok: false, error: "缺少 upserts" }, 400);

  const db = getDb();
  const out: Record<string, { inserted: number[]; updated: number[] }> = {
    accounts: { inserted: [], updated: [] },
    suppliers: { inserted: [], updated: [] },
    investors: { inserted: [], updated: [] },
  };

  type Acc = Partial<typeof accounts.$inferInsert>;
  for (const raw of body.upserts.accounts ?? []) {
    const r = raw as Record<string, unknown>;
    const typeKey = TYPE_KEY[String(r.type ?? "")] ?? String(r.type ?? "");
    const row: Acc = {
      name: String(r.name ?? "").trim(),
      relationshipType: (typeKey || "client") as Acc["relationshipType"],
      kind: (KIND_KEY[String(r.kind ?? "")] ?? String(r.kind ?? "")) as Acc["kind"],
      industry: (r.industry as string) || null,
      stage: stageFromZh(typeKey, r.stage as string | null) as Acc["stage"],
      website: (r.website as string) || null,
      location: (r.location as string) || null,
      source: (r.source as string) || null,
      tags: (r.tags as string) || null,
      nextActionAt: (r.nextActionAt as string) || null,
      lastContactAt: (r.lastContactAt as string) || null,
      externalId: (r.external_id as string) || null,
    };
    const id = Number(r.wtc_id);
    if (id > 0 && !Number.isNaN(id)) {
      await db.update(accounts).set(row).where(eq(accounts.id, id));
      out.accounts.updated.push(id);
    } else if (row.name) {
      const [res] = await db.insert(accounts).values(row as unknown as typeof accounts.$inferInsert);
      out.accounts.inserted.push(Number(res.insertId));
    }
  }

  type Sup = Partial<typeof suppliers.$inferInsert>;
  for (const raw of body.upserts.suppliers ?? []) {
    const r = raw as Record<string, unknown>;
    const cat = String(r.category ?? "");
    const rk = String(r.risk ?? "");
    const row: Sup = {
      name: String(r.name ?? "").trim(),
      category: ((CATEGORY_KEY[cat] ?? cat) || null) as Sup["category"],
      contactName: (r.contactName as string) || null,
      contactPhone: (r.contactPhone as string) || null,
      contactWechat: (r.contactWechat as string) || null,
      stage: stageFromZh("supplier", r.stage as string | null) as Sup["stage"],
      amountCny: r.amountCny != null && String(r.amountCny) !== "" ? String(r.amountCny) : null,
      startDate: (r.startDate as string) || null,
      endDate: (r.endDate as string) || null,
      accountTerms: (r.accountTerms as string) || null,
      risk: ((RISK_KEY[rk] ?? rk) || null) as Sup["risk"],
      memo: (r.memo as string) || null,
      externalId: (r.external_id as string) || null,
    };
    const id = Number(r.wtc_id);
    if (id > 0 && !Number.isNaN(id)) {
      await db.update(suppliers).set(row).where(eq(suppliers.id, id));
      out.suppliers.updated.push(id);
    } else if (row.name) {
      const [res] = await db.insert(suppliers).values(row as unknown as typeof suppliers.$inferInsert);
      out.suppliers.inserted.push(Number(res.insertId));
    }
  }

  type Inv = Partial<typeof investors.$inferInsert>;
  for (const raw of body.upserts.investors ?? []) {
    const r = raw as Record<string, unknown>;
    const row: Inv = {
      name: String(r.name ?? "").trim(),
      firm: (r.firm as string) || null,
      contactName: (r.contactName as string) || null,
      tags: (r.tags as string) || null,
      stage: stageFromZh("investor", r.stage as string | null) as Inv["stage"],
      memo: (r.memo as string) || null,
      externalId: (r.external_id as string) || null,
    };
    const id = Number(r.wtc_id);
    if (id > 0 && !Number.isNaN(id)) {
      await db.update(investors).set(row).where(eq(investors.id, id));
      out.investors.updated.push(id);
    } else if (row.name) {
      const [res] = await db.insert(investors).values(row as unknown as typeof investors.$inferInsert);
      out.investors.inserted.push(Number(res.insertId));
    }
  }
  return c.json({ ok: true, result: out });
}

/** 注册到 Hono app（必须放在 /api/* 404 之前） */
export function registerSyncApi(app: Hono<{ Bindings: HttpBindings }>) {
  app.get("/api/sync/fetch", handleFetch);
  app.post("/api/sync/commit", handleCommit);
}
