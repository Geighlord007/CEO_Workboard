/**
 * 供应商表（通用 DataTable 实现）· 结构定稿 v3 列顺序
 * - 数据：crm.supplier.list()
 * - 默认可见列：名称 → 类别 → 阶段 → NDA → 能力(tags) → 金额 → 开始日期 → 结束日期
 *   → 账期 → 风险 → 联系人/联系方式 → 最近反馈 → (默认隐藏) 标签 → 备注 → 导入溯源
 * - 行内编辑仅 admin（isAdmin=false 时不传 onCellEdit），只提交 crm.supplier.update 已开放的字段
 * - 详情抽屉：基本信息 + 该供应商的询价记录（crm.rfq.list）+ 质量事件（crm.qualityEvent.list）
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/providers/trpc";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { STAGE_FLOW, STAGE_LABELS, STAGE_LABELS_EN, dual } from "@contracts/crm";
import type { AppRouter } from "../../../api/router";

type SupplierRow = inferRouterOutputs<AppRouter>["crm"]["supplier"]["list"][number];
type SupplierPatch = inferRouterInputs<AppRouter>["crm"]["supplier"]["update"]["patch"];
type SupplierStage = NonNullable<SupplierPatch["stage"]>;
type SupplierRisk = NonNullable<SupplierPatch["risk"]>;
type RfqRow = inferRouterOutputs<AppRouter>["crm"]["rfq"]["list"][number];
type QualityEventRow = inferRouterOutputs<AppRouter>["crm"]["qualityEvent"]["list"][number];

/** 阶段选项：STAGE_FLOW.supplier（含新档 prospecting）+ 中英标签 */
const STAGE_OPTIONS = [...STAGE_FLOW.supplier.stages, ...STAGE_FLOW.supplier.terminal].map((s) => ({
  value: s,
  zh: STAGE_LABELS.supplier[s] ?? s,
  en: STAGE_LABELS_EN.supplier[s] ?? "",
}));
const STAGE_ORDER = [...STAGE_FLOW.supplier.stages, ...STAGE_FLOW.supplier.terminal];

/** 类别（后端 suppliers.category 的已知取值） */
const CATEGORY_META: Record<string, { zh: string; en: string }> = {
  gene_synthesis: { zh: "基因合成", en: "Gene synthesis" },
  primer: { zh: "引物", en: "Primer" },
  sequencing: { zh: "测序", en: "Sequencing" },
  reagent: { zh: "试剂", en: "Reagent" },
  consumable: { zh: "耗材", en: "Consumable" },
  equipment: { zh: "设备", en: "Equipment" },
  cdmo: { zh: "CDMO", en: "CDMO" },
  logistics: { zh: "物流", en: "Logistics" },
  other: { zh: "其他", en: "Other" },
};
const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([value, m]) => ({
  value,
  zh: m.zh,
  en: m.en,
}));

/** 风险等级（后端 risk: H/M/L） */
const RISK_META: Record<string, { zh: string; en: string }> = {
  H: { zh: "高", en: "High" },
  M: { zh: "中", en: "Medium" },
  L: { zh: "低", en: "Low" },
};
const RISK_OPTIONS = Object.entries(RISK_META).map(([value, m]) => ({
  value,
  zh: m.zh,
  en: m.en,
}));

/** NDA 已签/未签（suppliers.ndaSigned 可空：空与 false 都按未签展示） */
const NDA_OPTIONS = [
  { value: "1", zh: "已签", en: "Signed" },
  { value: "0", zh: "未签", en: "Not signed" },
];

/** 询价状态（后端 RFQ_STATUS） */
const RFQ_STATUS_META: Record<string, { zh: string; en: string }> = {
  asking: { zh: "询价中", en: "Asking" },
  comparing: { zh: "比价中", en: "Comparing" },
  chosen: { zh: "已选", en: "Chosen" },
  dropped: { zh: "弃用", en: "Dropped" },
};

/** 质量事件类型（后端 quality_events.kind） */
const QE_KIND_META: Record<string, { zh: string; en: string }> = {
  delay: { zh: "交期延误", en: "Delivery delay" },
  quality: { zh: "质量问题", en: "Quality issue" },
  service: { zh: "服务问题", en: "Service issue" },
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const nf = new Intl.NumberFormat("zh-CN");

/* ------------------------------------------------------------------ */
/* 取值 / 转换工具                                                      */
/* ------------------------------------------------------------------ */

function asText(raw: unknown): string | null {
  const s = raw === null || raw === undefined ? "" : String(raw).trim();
  return s || null;
}

function asNumber(raw: unknown): number | null {
  const s = asText(raw);
  if (s === null) return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 日期单元格：空值=清空，格式不对=不提交（避免误清空） */
function dayOrAbort(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const s = asText(raw);
  if (s && !DAY_RE.test(s)) return { ok: false };
  return { ok: true, value: s };
}

function money(v: string | null): string {
  if (v === null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `¥${nf.format(Math.round(n))}` : v;
}

function categoryMeta(v: string | null): { zh: string; en: string } | null {
  return v ? CATEGORY_META[v.toLowerCase()] ?? null : null;
}

function stageText(stage: string): string {
  return dual(STAGE_LABELS.supplier[stage] ?? stage, STAGE_LABELS_EN.supplier[stage]);
}

/** 联系方式：电话优先，其次微信 */
function reachOf(r: SupplierRow): string | null {
  return r.contactPhone || r.contactWechat || null;
}

/** 最近反馈：memo 第一行 */
function feedbackOf(r: SupplierRow): string | null {
  const first = (r.memo ?? "").split(/\r?\n/)[0]?.trim();
  return first || null;
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

export function SuppliersTable({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = trpc.crm.supplier.list.useQuery();
  const [open, setOpen] = React.useState<SupplierRow | null>(null);

  const update = trpc.crm.supplier.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", "supplier", "list"] }),
  });

  const rows = data ?? [];

  /** 行内编辑：只映射到 supplier.update 支持的字段，其余直接忽略 */
  const save = async (row: SupplierRow, key: string, value: unknown) => {
    const patch: SupplierPatch = {};
    switch (key) {
      case "name": {
        const s = asText(value);
        if (!s) return; // 后端 name 必填，空值不提交
        patch.name = s;
        break;
      }
      case "category":
        patch.category = asText(value);
        break;
      case "stage": {
        const s = asText(value);
        if (!s || !STAGE_ORDER.includes(s)) return;
        patch.stage = s as SupplierStage;
        break;
      }
      case "contactName":
        patch.contactName = asText(value);
        break;
      case "contactPhone":
        patch.contactPhone = asText(value);
        break;
      case "amountCny":
        patch.amountCny = asNumber(value);
        break;
      case "startDate": {
        const d = dayOrAbort(value);
        if (!d.ok) {
          window.alert("日期格式需为 YYYY-MM-DD（留空则清空）");
          return;
        }
        patch.startDate = d.value;
        break;
      }
      case "endDate": {
        const d = dayOrAbort(value);
        if (!d.ok) {
          window.alert("日期格式需为 YYYY-MM-DD（留空则清空）");
          return;
        }
        patch.endDate = d.value;
        break;
      }
      case "accountTerms":
        patch.accountTerms = asText(value);
        break;
      case "risk": {
        const s = asText(value);
        patch.risk = s && s in RISK_META ? (s as SupplierRisk) : null;
        break;
      }
      /** 「能力」列直接编辑 tags 文本 */
      case "nda": {
        patch.ndaSigned = String(value) === "1";
        break;
      }
      case "ndaDate": {
        const d = dayOrAbort(value);
        if (!d.ok) {
          window.alert("日期格式需为 YYYY-MM-DD（留空则清空）");
          return;
        }
        patch.ndaDate = d.value;
        break;
      }
      case "capability":
      case "tags":
        patch.tags = asText(value);
        break;
      case "memo":
        patch.memo = asText(value);
        break;
      default:
        return;
    }
    try {
      await update.mutateAsync({ id: row.id, patch });
    } catch (err) {
      window.alert(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const columns: Column<SupplierRow>[] = [
    {
      key: "name", zh: "名称", en: "Name", type: "text", width: 200,
      editable: true, filterable: true, value: (r) => r.name,
    },
    {
      key: "category", zh: "类别", en: "Category", type: "enum", width: 120,
      options: CATEGORY_OPTIONS, filterable: true, editable: true,
      value: (r) => r.category,
      render: (r) => {
        if (!r.category) return <span className="opacity-30">—</span>;
        const m = categoryMeta(r.category);
        return (
          <Badge variant="outline" title={m?.en}>
            {m ? dual(m.zh, m.en) : r.category}
          </Badge>
        );
      },
    },
    {
      key: "stage", zh: "阶段", en: "Stage", type: "enum", width: 140,
      options: STAGE_OPTIONS, filterable: true, editable: true,
      value: (r) => r.stage,
      sortValue: (r) => STAGE_ORDER.indexOf(r.stage),
      render: (r) => {
        const terminal = STAGE_FLOW.supplier.terminal.includes(r.stage);
        return (
          <Badge
            variant={r.stage === "terminated" ? "outline" : terminal ? "secondary" : "default"}
            title={STAGE_LABELS_EN.supplier[r.stage]}
          >
            {stageText(r.stage)}
          </Badge>
        );
      },
    },
    {
      key: "nda", zh: "NDA", en: "NDA", type: "enum", width: 150,
      options: NDA_OPTIONS, filterable: true, editable: true,
      value: (r) => (r.ndaSigned ? "1" : "0"),
      sortValue: (r) => (r.ndaSigned ? 1 : 0),
      render: (r) => (
        <span className="flex items-center gap-1.5">
          {r.ndaSigned ? (
            <Badge className="bg-emerald-600 text-white" title="已签">
              已签
            </Badge>
          ) : (
            <Badge variant="outline" className="opacity-70" title="未签">
              未签
            </Badge>
          )}
          {r.ndaDate && <span className="text-xs opacity-60">{r.ndaDate}</span>}
        </span>
      ),
    },
    {
      key: "ndaDate", zh: "NDA 日期", en: "NDA date", type: "date", width: 110,
      editable: true, hiddenByDefault: true,
      value: (r) => r.ndaDate,
    },
    {
      key: "capability", zh: "能力", en: "Capability", type: "tags", width: 200,
      editable: true, value: (r) => r.tags,
    },
    {
      key: "amountCny", zh: "金额", en: "Amount", type: "money", width: 130,
      align: "right", editable: true,
      value: (r) => r.amountCny,
      sortValue: (r) => (r.amountCny === null ? null : Number(r.amountCny)),
    },
    {
      key: "startDate", zh: "开始日期", en: "Start date", type: "date", width: 110,
      editable: true, value: (r) => r.startDate,
    },
    {
      key: "endDate", zh: "结束日期", en: "End date", type: "date", width: 110,
      editable: true, value: (r) => r.endDate,
    },
    {
      key: "accountTerms", zh: "账期", en: "Payment terms", type: "text", width: 110,
      editable: true, value: (r) => r.accountTerms,
    },
    {
      key: "risk", zh: "风险", en: "Risk", type: "enum", width: 90,
      options: RISK_OPTIONS, filterable: true, editable: true,
      value: (r) => r.risk,
      sortValue: (r) => (r.risk ? "HML".indexOf(r.risk) : null),
      render: (r) => {
        if (!r.risk) return <span className="opacity-30">—</span>;
        const m = RISK_META[r.risk];
        return (
          <Badge
            variant={r.risk === "H" ? "destructive" : r.risk === "M" ? "secondary" : "outline"}
            title={m?.en}
          >
            {m ? dual(m.zh, m.en) : r.risk}
          </Badge>
        );
      },
    },
    {
      key: "contactName", zh: "联系人 / 联系方式", en: "Contact / Reach", type: "text", width: 190,
      editable: true,
      value: (r) => r.contactName,
      exportValue: (r) => [r.contactName, reachOf(r)].filter(Boolean).join(" · "),
      render: (r) => {
        const reach = reachOf(r);
        if (!r.contactName && !reach) return <span className="opacity-30">—</span>;
        return (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate">{r.contactName || "—"}</span>
            {reach && <span className="truncate text-xs opacity-60">{reach}</span>}
          </span>
        );
      },
    },
    {
      key: "feedback", zh: "最近反馈", en: "Latest feedback", type: "text", width: 200,
      value: (r) => feedbackOf(r),
      render: (r) => {
        const s = feedbackOf(r);
        if (!s) return <span className="opacity-30">—</span>;
        return (
          <span className="line-clamp-1 max-w-[220px]" title={r.memo ?? ""}>
            {s}
          </span>
        );
      },
    },
    /* ---------- 默认隐藏（避免与「能力」重复/信息过载） ---------- */
    {
      key: "tags", zh: "标签", en: "Tags", type: "tags", width: 180,
      editable: true, hiddenByDefault: true, value: (r) => r.tags,
    },
    {
      key: "memo", zh: "备注", en: "Memo", type: "longtext", width: 260,
      editable: true, hiddenByDefault: true, value: (r) => r.memo,
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
      <DataTable<SupplierRow>
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(r) => r.id}
        storageKey="suppliers"
        exportName="供应商"
        emptyTitle="还没有供应商"
        emptyHint="从「供应商管理」页新建，或导入旧数据"
        onRowClick={(r) => setOpen(r)}
        onCellEdit={isAdmin ? save : undefined}
        onRefresh={() => void refetch()}
        initialSort={{ key: "name", dir: "asc" }}
      />

      <Drawer open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>{current?.name}</DrawerTitle>
            <DrawerDescription>
              {current && (
                <>
                  {categoryMeta(current.category)?.zh ?? current.category ?? "—"} ·{" "}
                  {stageText(current.stage)}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>
          {current && <SupplierDetail supplier={current} />}
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

function SupplierDetail({ supplier }: { supplier: SupplierRow }) {
  const { data: rfqData, isLoading: rfqLoading } = trpc.crm.rfq.list.useQuery({
    supplierId: supplier.id,
  });
  const { data: eventData, isLoading: eventLoading } = trpc.crm.qualityEvent.list.useQuery({
    supplierId: supplier.id,
  });

  const rfqs = rfqData ?? [];
  const events = eventData ?? [];
  const tags = (supplier.tags ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const risk = supplier.risk ? RISK_META[supplier.risk] : null;

  return (
    <div className="space-y-4 overflow-auto px-4 pb-6 text-sm">
      <section>
        <div className="mb-1.5 text-xs font-medium opacity-60">基本信息</div>
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5">
          <Field label="阶段">
            <Badge variant="outline" title={STAGE_LABELS_EN.supplier[supplier.stage]}>
              {stageText(supplier.stage)}
            </Badge>
          </Field>
          <Field label="类别">
            {categoryMeta(supplier.category)
              ? dual(categoryMeta(supplier.category)!.zh, categoryMeta(supplier.category)!.en)
              : supplier.category || "—"}
          </Field>
          <Field label="NDA">
            {supplier.ndaSigned ? (
              <span className="flex items-center gap-1.5">
                <Badge className="bg-emerald-600 text-white">已签</Badge>
                {supplier.ndaDate && <span className="opacity-60">{supplier.ndaDate}</span>}
              </span>
            ) : (
              <span className="opacity-60">{supplier.ndaDate ? `未标记（${supplier.ndaDate}）` : "—"}</span>
            )}
          </Field>
          <Field label="联系人">{supplier.contactName || "—"}</Field>
          <Field label="电话">{supplier.contactPhone || "—"}</Field>
          <Field label="微信">{supplier.contactWechat || "—"}</Field>
          <Field label="金额">{money(supplier.amountCny)}</Field>
          <Field label="开始日期">{supplier.startDate ?? "—"}</Field>
          <Field label="结束日期">{supplier.endDate ?? "—"}</Field>
          <Field label="账期">{supplier.accountTerms || "—"}</Field>
          <Field label="风险">
            {risk ? (
              <Badge variant={supplier.risk === "H" ? "destructive" : supplier.risk === "M" ? "secondary" : "outline"} title={risk.en}>
                {dual(risk.zh, risk.en)}
              </Badge>
            ) : (
              "—"
            )}
          </Field>
          <Field label="单一来源">{supplier.singleSource ? "是" : "否"}</Field>
          <Field label="能力 / 标签">
            {tags.length === 0 ? (
              "—"
            ) : (
              <span className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="font-normal">
                    {t}
                  </Badge>
                ))}
              </span>
            )}
          </Field>
          <Field label="备注">
            <span className="whitespace-pre-wrap opacity-80">{supplier.memo || "—"}</span>
          </Field>
        </dl>
      </section>

      <section>
        <div className="mb-1.5 text-xs font-medium opacity-60">
          询价记录（{rfqLoading ? "…" : rfqs.length}）
        </div>
        {!rfqLoading && rfqs.length === 0 ? (
          <div className="opacity-50">暂无询价</div>
        ) : (
          <div className="space-y-1.5">
            {rfqs.map((q: RfqRow) => (
              <div key={q.id} className="rounded-md border px-2 py-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" title={RFQ_STATUS_META[q.status]?.en}>
                    {RFQ_STATUS_META[q.status]
                      ? dual(RFQ_STATUS_META[q.status].zh, RFQ_STATUS_META[q.status].en)
                      : q.status}
                  </Badge>
                  <span className="font-medium">{q.item}</span>
                  {q.qty && <span className="opacity-60">{q.qty}</span>}
                  <span className="ml-auto tabular-nums">{money(q.priceCny)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 opacity-60">
                  {q.deliveryDays !== null && <span>交期 {q.deliveryDays} 天</span>}
                  <span>有效期 {q.validUntil ?? "—"}</span>
                  {q.memo && <span>{q.memo}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-1.5 text-xs font-medium opacity-60">
          质量事件（{eventLoading ? "…" : events.length}）
        </div>
        {!eventLoading && events.length === 0 ? (
          <div className="opacity-50">暂无质量事件</div>
        ) : (
          <div className="space-y-1.5">
            {events.map((e: QualityEventRow) => (
              <div key={e.id} className="rounded-md border px-2 py-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={e.resolvedAt ? "secondary" : "destructive"}
                    title={QE_KIND_META[e.kind]?.en}
                  >
                    {QE_KIND_META[e.kind]
                      ? dual(QE_KIND_META[e.kind].zh, QE_KIND_META[e.kind].en)
                      : e.kind}
                  </Badge>
                  <span className="font-medium">{e.summary}</span>
                  <span className="ml-auto opacity-60">
                    {e.resolvedAt ? `已解决 ${e.resolvedAt}` : "未解决"}
                  </span>
                </div>
                {e.impact && <div className="mt-0.5 opacity-60">影响：{e.impact}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
