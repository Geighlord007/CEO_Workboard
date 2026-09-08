/**
 * 客户/合作方表（accounts）· 结构定稿 v3 列顺序
 * - 数据：crm.account.list()（全列）+ crm.contact.list()（按 accountId 取第一条联系人）
 * - 默认可见列：公司名 → 类别 → 成熟度 → 行业 → 做什么 → 合作内容 → 底盘/技术 → 进度
 *   → 联系人 → 职级 → 联系方式 → 下次动作 → 最近联系 → 备注
 * - 默认隐藏（可在「列」里勾出）：地区、标签、产品、业务模式、网址、来源、导入溯源
 * - 行内编辑仅 admin（isAdmin=false 时不传 onCellEdit）；写入走 crm.account.update 已开放的字段
 * - 详情抽屉：结构信息 + 联系人列表 + 商机列表 + 备注全文
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { DataTable, type Column } from "@/components/table/DataTable";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FollowupSection } from "@/components/modules/FollowupsPage";
import { Badge } from "@/components/ui/badge";
import {
  REL_TYPE_META,
  STAGE_FLOW,
  STAGE_LABELS,
  STAGE_LABELS_EN,
  dual,
  type RelationshipType,
} from "@contracts/crm";
import type { AppRouter } from "../../../api/router";

type AccountRow = inferRouterOutputs<AppRouter>["crm"]["account"]["list"][number];
type AccountPatch = inferRouterInputs<AppRouter>["crm"]["account"]["update"]["patch"];
type ContactRow = inferRouterOutputs<AppRouter>["crm"]["contact"]["list"][number];

export type { AccountRow };

/* ------------------------------------------------------------------ */
/* 选项 / 文案                                                          */
/* ------------------------------------------------------------------ */

const KIND_LABELS: Record<string, string> = {
  company: "公司",
  institute: "院所",
  lab: "实验室",
  government: "政府",
  other: "其他",
};

const REL_OPTIONS = (Object.keys(REL_TYPE_META) as RelationshipType[])
  .filter((t) => ["client", "partner", "consultant"].includes(t))
  .map((t) => ({ value: t, zh: REL_TYPE_META[t].label, en: REL_TYPE_META[t].labelEn }));

/** 客户/合作方阶段选项（合并 client+partner 两套流程的取值） */
const ACCOUNT_STAGE_OPTIONS = Array.from(
  new Set([...STAGE_FLOW.client.stages, ...STAGE_FLOW.client.terminal, ...STAGE_FLOW.partner.stages, ...STAGE_FLOW.partner.terminal]),
).map((s) => ({
  value: s,
  zh: STAGE_LABELS.client[s] ?? STAGE_LABELS.partner[s] ?? s,
  en: STAGE_LABELS_EN.client[s] ?? STAGE_LABELS_EN.partner[s],
}));

/** 成熟度：库里是自由文本，这里统一归一化到三个档位 */
const MATURITY_META: Record<string, { zh: string; en: string }> = {
  初创: { zh: "初创", en: "Startup" },
  有收入: { zh: "有收入", en: "Revenue" },
  已上市: { zh: "已上市", en: "Listed" },
};
const MATURITY_ALIASES: Record<string, string> = {
  startup: "初创",
  early: "初创",
  earlystage: "初创",
  seed: "初创",
  revenue: "有收入",
  growth: "有收入",
  scaleup: "有收入",
  listed: "已上市",
  public: "已上市",
  ipo: "已上市",
  "上市": "已上市",
};
const MATURITY_OPTIONS = Object.entries(MATURITY_META).map(([value, m]) => ({
  value,
  zh: m.zh,
  en: m.en,
}));

const REL_VALUES: string[] = REL_OPTIONS.map((o) => o.value);
const STAGE_VALUES: string[] = ACCOUNT_STAGE_OPTIONS.map((o) => o.value);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function asText(raw: unknown): string | null {
  const s = raw === null || raw === undefined ? "" : String(raw).trim();
  return s || null;
}

/** 日期单元格：空值=清空，格式不对=不提交（避免误清空） */
function dayOrAbort(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const s = asText(raw);
  if (s && !DAY_RE.test(s)) return { ok: false };
  return { ok: true, value: s };
}

/** 成熟度归一化：兼容中文/英文两套写法 */
function maturityValue(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (MATURITY_META[s]) return s;
  return MATURITY_ALIASES[s.toLowerCase().replace(/[\s_-]/g, "")] ?? s;
}

function maturityBadge(raw: string | null | undefined): React.ReactNode {
  const v = maturityValue(raw);
  if (!v) return <span className="opacity-30">—</span>;
  const m = MATURITY_META[v];
  return (
    <Badge variant="outline" title={m?.en}>
      {m ? dual(m.zh, m.en) : v}
    </Badge>
  );
}

function whatTheyDo(r: AccountRow): string {
  return [r.product, r.businessModel].map((s) => (s ?? "").trim()).filter(Boolean).join(" · ");
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

export function CustomersTable({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = trpc.crm.account.list.useQuery();
  const { data: contactData } = trpc.crm.contact.list.useQuery();
  const [open, setOpen] = React.useState<AccountRow | null>(null);

  const update = trpc.crm.account.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", "account", "list"] }),
  });

  const rows = data ?? [];

  /** accountId → 该账户联系人（接口按姓名升序返回，取第一条为主联系人） */
  const contactsByAccount = React.useMemo(() => {
    const m = new Map<number, ContactRow[]>();
    for (const c of contactData ?? []) {
      if (c.accountId === null || c.accountId === undefined) continue;
      const list = m.get(c.accountId);
      if (list) list.push(c);
      else m.set(c.accountId, [c]);
    }
    return m;
  }, [contactData]);

  const primaryContact = (r: AccountRow): ContactRow | null => contactsByAccount.get(r.id)?.[0] ?? null;

  /** 行内编辑：映射到 crm.account.update 已开放的字段 */
  const save = async (row: AccountRow, key: string, value: unknown) => {
    const patch: AccountPatch = {};
    switch (key) {
      case "name": {
        const s = asText(value);
        if (!s) return; // 后端 name 必填，空值不提交
        patch.name = s;
        break;
      }
      case "relationshipType": {
        const s = asText(value);
        if (!s || !REL_VALUES.includes(s)) return;
        patch.relationshipType = s as NonNullable<AccountPatch["relationshipType"]>;
        break;
      }
      case "industry":
        patch.industry = asText(value);
        break;
      case "stage": {
        const s = asText(value);
        if (!s || !STAGE_VALUES.includes(s)) return;
        patch.stage = s as NonNullable<AccountPatch["stage"]>;
        break;
      }
      case "tags":
        patch.tags = asText(value);
        break;
      case "memo":
        patch.memo = asText(value);
        break;
      case "website":
        patch.website = asText(value);
        break;
      case "location":
        patch.location = asText(value);
        break;
      case "source":
        patch.source = asText(value);
        break;
      case "nextActionAt": {
        const d = dayOrAbort(value);
        if (!d.ok) {
          window.alert("日期格式需为 YYYY-MM-DD（留空则清空）");
          return;
        }
        patch.nextActionAt = d.value;
        break;
      }
      case "lastContactAt": {
        const d = dayOrAbort(value);
        if (!d.ok) {
          window.alert("日期格式需为 YYYY-MM-DD（留空则清空）");
          return;
        }
        patch.lastContactAt = d.value;
        break;
      }
      case "maturity":
      case "cooperation":
      case "organism":
      case "product":
      case "businessModel":
        (patch as Record<string, string | null>)[key] = asText(value);
        break;
      default:
        return;
    }
    try {
      await update.mutateAsync({ id: row.id, patch });
    } catch (err) {
      toast.error(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const columns: Column<AccountRow>[] = [
    {
      key: "name", zh: "公司名", en: "Name", type: "text", width: 220,
      editable: true, filterable: true, value: (r) => r.name,
    },
    {
      key: "relationshipType", zh: "类别", en: "Relationship", type: "enum", width: 110,
      options: REL_OPTIONS, filterable: true, editable: true,
      value: (r) => r.relationshipType,
      render: (r) => {
        const m = REL_TYPE_META[r.relationshipType as RelationshipType];
        return <Badge variant="outline">{m ? dual(m.label, m.labelEn) : r.relationshipType}</Badge>;
      },
    },
    {
      key: "maturity", zh: "成熟度", en: "Maturity", type: "enum", width: 120,
      options: MATURITY_OPTIONS, filterable: true, editable: true,
      value: (r) => maturityValue(r.maturity),
      render: (r) => maturityBadge(r.maturity),
    },
    {
      key: "industry", zh: "行业", en: "Industry", type: "text", width: 120,
      editable: true, filterable: true, value: (r) => r.industry,
    },
    {
      key: "whatTheyDo", zh: "做什么", en: "What they do", type: "text", width: 220,
      value: (r) => whatTheyDo(r),
      render: (r) => {
        const s = whatTheyDo(r);
        if (!s) return <span className="opacity-30">—</span>;
        return (
          <span className="line-clamp-2 max-w-[240px]" title={s}>
            {s}
          </span>
        );
      },
    },
    {
      key: "cooperation", zh: "合作内容", en: "Cooperation", type: "longtext", width: 200,
      editable: true, value: (r) => r.cooperation,
    },
    {
      key: "organism", zh: "底盘/技术", en: "Chassis / tech", type: "text", width: 140,
      editable: true, value: (r) => r.organism,
    },
    {
      key: "stage", zh: "进度", en: "Stage", type: "enum", width: 130,
      options: ACCOUNT_STAGE_OPTIONS, filterable: true, editable: true,
      value: (r) => r.stage,
      render: (r) => {
        const type: RelationshipType = r.relationshipType === "partner" ? "partner" : "client";
        const zh = STAGE_LABELS[type]?.[r.stage] ?? r.stage;
        const en = STAGE_LABELS_EN[type]?.[r.stage];
        const terminal = STAGE_FLOW[type].terminal.includes(r.stage);
        return <Badge variant={terminal ? "secondary" : "default"} title={en}>{zh}</Badge>;
      },
    },
    {
      key: "contactPrimary", zh: "联系人", en: "Contact", type: "text", width: 120,
      value: (r) => primaryContact(r)?.name ?? null,
      render: (r) => {
        const list = contactsByAccount.get(r.id) ?? [];
        if (list.length === 0) return <span className="opacity-30">—</span>;
        return (
          <span className="flex items-center gap-1.5">
            <span className="truncate">{list[0].name}</span>
            {list.length > 1 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]" title={list.map((c) => c.name).join("、")}>
                +{list.length - 1}
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      key: "contactTitle", zh: "职级", en: "Title", type: "text", width: 120,
      value: (r) => primaryContact(r)?.title ?? null,
    },
    {
      key: "contactReach", zh: "联系方式", en: "Reach", type: "text", width: 180,
      value: (r) => {
        const c = primaryContact(r);
        return c?.email ?? c?.linkedinUrl ?? null;
      },
      render: (r) => {
        const c = primaryContact(r);
        if (!c) return <span className="opacity-30">—</span>;
        if (c.email) {
          return (
            <a
              href={`mailto:${c.email}`}
              onClick={(e) => e.stopPropagation()}
              className="underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              {c.email}
            </a>
          );
        }
        if (c.linkedinUrl) {
          return (
            <a
              href={c.linkedinUrl.startsWith("http") ? c.linkedinUrl : `https://${c.linkedinUrl}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              LinkedIn
            </a>
          );
        }
        return <span className="opacity-30">—</span>;
      },
    },
    {
      key: "nextActionAt", zh: "下次动作", en: "Next action", type: "date", width: 110,
      editable: true, value: (r) => r.nextActionAt,
    },
    {
      key: "lastContactAt", zh: "最近联系", en: "Last contact", type: "date", width: 110,
      editable: true, value: (r) => r.lastContactAt,
    },
    {
      key: "memo", zh: "备注", en: "Memo", type: "longtext", width: 260,
      editable: true, value: (r) => r.memo,
    },
    /* ---------- 默认隐藏 ---------- */
    {
      key: "location", zh: "地区", en: "Location", type: "text", width: 120,
      editable: true, hiddenByDefault: true, value: (r) => r.location,
    },
    {
      key: "tags", zh: "标签", en: "Tags", type: "tags", width: 200,
      editable: true, hiddenByDefault: true, value: (r) => r.tags,
    },
    {
      key: "product", zh: "产品", en: "Product", type: "text", width: 200,
      editable: true, hiddenByDefault: true, value: (r) => r.product,
    },
    {
      key: "businessModel", zh: "业务模式", en: "Business model", type: "text", width: 160,
      editable: true, hiddenByDefault: true, value: (r) => r.businessModel,
    },
    {
      key: "website", zh: "网址", en: "Website", type: "link", width: 160,
      editable: true, hiddenByDefault: true, value: (r) => r.website,
    },
    {
      key: "source", zh: "来源", en: "Source", type: "text", width: 100,
      editable: true, hiddenByDefault: true, filterable: true, value: (r) => r.source,
    },
    {
      key: "importNote", zh: "导入溯源", en: "Import note", type: "longtext", width: 240,
      hiddenByDefault: true, value: (r) => r.importNote,
    },
  ];

  // 抽屉始终取最新行，行内编辑后详情同步刷新
  const current = open ? rows.find((r) => r.id === open.id) ?? open : null;

  return (
    <>
      <DataTable<AccountRow>
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(r) => r.id}
        storageKey="accounts"
        exportName="客户-合作方"
        emptyTitle="还没有客户/合作方"
        emptyHint="从「客户卡」页新建，或导入旧数据"
        onRowClick={(r) => setOpen(r)}
        onCellEdit={isAdmin ? save : undefined}
        initialSort={{ key: "name", dir: "asc" }}
      />

      <Drawer open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>{current?.name}</DrawerTitle>
            <DrawerDescription>
              {current && (
                <>
                  {REL_TYPE_META[current.relationshipType as RelationshipType]?.label ?? current.relationshipType} ·{" "}
                  {current.industry ?? "—"} · {current.location ?? "—"}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>
          {current && <AccountDetail account={current} />}
          {current && (
            <div className="px-4 pb-6">
              <FollowupSection
                entityType="account"
                entityId={current.id}
                entityName={current.name}
                isAdmin={isAdmin}
              />
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 详情抽屉                                                            */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="opacity-60">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function AccountDetail({ account }: { account: AccountRow }) {
  const { data: contacts } = trpc.crm.contact.listByAccount.useQuery({ accountId: account.id });
  const { data: opps } = trpc.crm.opportunity.list.useQuery({});
  const mine = (opps ?? []).filter((o) => o.accountId === account.id);

  const type: RelationshipType = account.relationshipType === "partner" ? "partner" : "client";
  const stageZh = STAGE_LABELS[type]?.[account.stage] ?? account.stage;
  const stageEn = STAGE_LABELS_EN[type]?.[account.stage];
  const tags = (account.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-4 overflow-auto px-4 pb-6 text-sm">
      <section>
        <div className="mb-1.5 text-xs font-medium opacity-60">结构信息</div>
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5">
          <Field label="类别">
            {REL_TYPE_META[account.relationshipType as RelationshipType]
              ? dual(
                  REL_TYPE_META[account.relationshipType as RelationshipType].label,
                  REL_TYPE_META[account.relationshipType as RelationshipType].labelEn,
                )
              : account.relationshipType}
          </Field>
          <Field label="进度">
            <Badge variant="outline" title={stageEn}>{stageZh}</Badge>
          </Field>
          <Field label="成熟度">{maturityBadge(account.maturity)}</Field>
          <Field label="行业">{account.industry || "—"}</Field>
          <Field label="机构类型">{KIND_LABELS[account.kind] ?? account.kind}</Field>
          <Field label="做什么">{whatTheyDo(account) || "—"}</Field>
          <Field label="合作内容">{account.cooperation || "—"}</Field>
          <Field label="底盘/技术">{account.organism || "—"}</Field>
          <Field label="地区">{account.location || "—"}</Field>
          <Field label="来源">{account.source || "—"}</Field>
          <Field label="网址">
            {account.website ? (
              <a
                href={account.website.startsWith("http") ? account.website : `https://${account.website}`}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 opacity-80 hover:opacity-100"
              >
                {account.website}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="下次动作">{account.nextActionAt || "—"}</Field>
          <Field label="最近联系">{account.lastContactAt || "—"}</Field>
          <Field label="标签">
            {tags.length === 0 ? (
              "—"
            ) : (
              <span className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>
                ))}
              </span>
            )}
          </Field>
        </dl>
      </section>

      <section>
        <div className="mb-1 text-xs font-medium opacity-60">商机（{mine.length}）</div>
        {mine.length === 0 ? (
          <div className="opacity-50">暂无商机</div>
        ) : (
          <ul className="space-y-1">
            {mine.map((o) => (
              <li key={o.id} className="flex items-center gap-2">
                <Badge variant="outline">{o.stage}</Badge>
                <span>{o.title}</span>
                {o.amountCny && <span className="opacity-60">¥{o.amountCny}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-1 text-xs font-medium opacity-60">联系人（{contacts?.length ?? 0}）</div>
        {(contacts ?? []).length === 0 ? (
          <div className="opacity-50">暂无联系人</div>
        ) : (
          <ul className="space-y-1">
            {(contacts ?? []).map((c) => (
              <li key={c.id}>
                {c.name} {c.title && <span className="opacity-60">· {c.title}</span>}
                {c.email && <span className="opacity-60"> · {c.email}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-1 text-xs font-medium opacity-60">备注</div>
        <div className="whitespace-pre-wrap opacity-80">{account.memo || "—"}</div>
      </section>
    </div>
  );
}
