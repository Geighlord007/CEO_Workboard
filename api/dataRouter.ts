/**
 * 数据浏览接口（admin only）
 * 给「数据」管理页提供通用能力：
 *  - listTables：可见业务表清单（不含 users/settings 等敏感表）
 *  - showTable：某张表的列元数据 + 行数据（≤500 行）
 *  - updateRow：按「可编辑字段白名单」安全更新单行（不可改主键/时间戳/系统列）
 * 白名单之外的任何列都不允许写，避免绕过业务规则把表搞坏。
 */
import { z } from "zod";
import mysql from "mysql2/promise";
import { createRouter, adminQuery } from "./middleware";
import { env } from "./lib/env";

let pool: mysql.Pool | null = null;
function db() {
  if (!pool) {
    pool = mysql.createPool({ uri: env.databaseUrl, connectionLimit: 2 });
  }
  return pool;
}

/** 可见表清单：name + 中文名 + 可编辑字段白名单 */
export const DATA_TABLES: Record<string, { label: string; edit: string[] }> = {
  tasks: { label: "本周任务", edit: ["title", "track", "priority", "dueDate", "link", "done", "weekOf", "completedDay"] },
  events: { label: "日历事项", edit: ["date", "title", "kind", "startMin", "endMin", "location"] },
  milestones: { label: "关键节点", edit: ["title", "targetDate", "startDate"] },
  notes: { label: "便签", edit: ["content", "sortOrder"] },
  risks: { label: "风险阻塞", edit: ["title", "detail", "needFrom", "level", "resolved"] },
  deals: { label: "旧版 BD 推进(遗留)", edit: ["name", "stage", "note"] },
  links: { label: "快捷入口", edit: ["label", "url", "sortOrder"] },
  activity: { label: "每日打卡/收工", edit: ["day", "level", "offworkMin"] },
  accounts: { label: "客户/合作方", edit: ["name", "relationshipType", "kind", "industry", "stage", "website", "location", "source", "nextActionAt", "lastContactAt", "tags", "memo", "product", "businessModel", "cooperation", "organism", "maturity"] },
  contacts: { label: "人脉/联系人", edit: ["accountId", "name", "title", "dept", "roleInDeal", "stance", "influence", "email", "wechat", "phone", "memo", "lastContactAt", "roleType", "outreachStage", "linkedinUrl", "referral", "tags", "emailKind", "affiliation"] },
  opportunities: { label: "商机", edit: ["title", "stage", "amountCny", "probability", "expectedClose", "nextAction", "nextActionDue", "lostReason", "tags", "memo", "techDiscussionDone", "proposalSent", "sampleSent", "pocPassed", "ndaSigned", "contractSigned"] },
  activities: { label: "CRM 沟通记录", edit: ["summary", "contacts", "nextActionAt", "happenedAt"] },
  samples: { label: "样品", edit: ["title", "qtySpec", "sentAt", "tracking", "status", "feedback", "followUpAt"] },
  suppliers: { label: "供应商", edit: ["name", "stage", "category", "contactName", "contactPhone", "contactWechat", "amountCny", "startDate", "endDate", "accountTerms", "singleSource", "risk", "memo", "tags", "location", "ndaSigned", "ndaDate"] },
  investors: { label: "投资人", edit: ["name", "firm", "round", "stage", "contactName", "contactTitle", "contactEmail", "emailKind", "contactLinkedin", "firstContactAt", "lastContactAt", "nextAction", "progressNote", "referral", "tags", "memo"] },
  rfqs: { label: "询价", edit: ["item", "qty", "priceCny", "deliveryDays", "validUntil", "status", "memo"] },
  quality_events: { label: "供应商质量事件", edit: ["summary", "impact", "resolvedAt", "memo"] },
  docs: { label: "文档外链", edit: ["title", "url", "version"] },
  company_library: { label: "公司库(情报·只读)", edit: [] },
  funding_events: { label: "融资事件(情报·只读)", edit: [] },
};

export const DATA_TABLE_KEYS = Object.keys(DATA_TABLES) as [string, ...string[]];

const TABLE_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function colKind(type: string): { kind: string; values?: string[]; enum?: boolean } {
  const t = type.toLowerCase();
  if (t.startsWith("enum")) {
    const m = t.match(/enum\((.+)\)/);
    const values = m
      ? m[1]
          .split(",")
          .map((s) => s.trim().replace(/^'(.*)'$/, "$1"))
          .filter((s) => s !== "")
      : [];
    return { kind: "enum", values, enum: true };
  }
  if (t.startsWith("tinyint(1)")) return { kind: "bool" };
  if (t.startsWith("tinyint") || t.startsWith("int") || t.startsWith("smallint") || t.startsWith("bigint")) return { kind: "int" };
  if (t.startsWith("decimal") || t.startsWith("double") || t.startsWith("float")) return { kind: "decimal" };
  if (t.startsWith("timestamp") || t.startsWith("datetime")) return { kind: "datetime" };
  return { kind: "string" };
}

export const dataRouter = createRouter({
  /** 可见表 + 行数 + 可编辑字段白名单 */
  listTables: adminQuery.query(async () => {
    const tables = Object.entries(DATA_TABLES).map(([name, meta]) => ({ name, label: meta.label, edit: meta.edit }));
    return tables;
  }),

  /** 列元数据 + 前 500 行 + 总行数 */
  showTable: adminQuery
    .input(z.object({ table: z.enum(DATA_TABLE_KEYS) }))
    .query(async ({ input }) => {
      const c = await db().getConnection();
      try {
        const [cols] = (await c.query(`SHOW COLUMNS FROM \`${input.table}\``)) as [mysql.RowDataPacket[], unknown];
        const editSet = new Set(DATA_TABLES[input.table].edit);
        const columns = (cols as mysql.RowDataPacket[]).map((r) => {
          const f = String(r.Field);
          const meta = colKind(String(r.Type));
          return {
            field: f,
            type: meta.kind,
            enumValues: meta.values ?? null,
            editable: editSet.has(f),
            nullable: String(r.Null).toUpperCase() === "YES",
            key: String(r.Key),
            extra: String(r.Extra),
          };
        });
        const [[{ c: total }]] = (await c.query(`SELECT COUNT(*) c FROM \`${input.table}\``)) as [mysql.RowDataPacket[], unknown];
        const [rows] = (await c.query(`SELECT * FROM \`${input.table}\` LIMIT 500`)) as [mysql.RowDataPacket[], unknown];
        return { columns, rows: rows as Record<string, unknown>[], total: Number(total) };
      } finally {
        c.release();
      }
    }),

  /** 按白名单安全更新一行 */
  updateRow: adminQuery
    .input(
      z.object({
        table: z.enum(DATA_TABLE_KEYS),
        id: z.number(),
        patch: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      }),
    )
    .mutation(async ({ input }) => {
      const allowed = new Set(DATA_TABLES[input.table].edit);
      if (!TABLE_RE.test(input.table)) throw new Error("非法表名");
      const entries = Object.entries(input.patch).filter(
        ([k]) => allowed.has(k) && TABLE_RE.test(k),
      );
      if (entries.length === 0) return { ok: true, updated: 0 };
      const sets = entries.map(([k]) => `\`${k}\` = ?`).join(", ");
      const values = entries.map(([, v]) => (v === "" ? null : v));
      const c = await db().getConnection();
      try {
        const [res] = (await c.execute(
          `UPDATE \`${input.table}\` SET ${sets} WHERE \`id\` = ?`,
          [...values, input.id],
        )) as [mysql.ResultSetHeader, unknown];
        return { ok: true, updated: res.affectedRows };
      } finally {
        c.release();
      }
    }),
});
