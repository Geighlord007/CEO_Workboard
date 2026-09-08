/**
 * 商机表（通用 DataTable 实现）
 * - 数据：crm.opportunity.list（{}）+ crm.account.list（accountId → 客户名）
 * - 行内编辑仅 admin，且只提交 crm.opportunity.update 已支持的字段
 * - 枚举统一「中文 (English)」显示；金额右对齐、空值显示 —
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
import { OPP_STAGE_META, dual } from "@contracts/crm";
import type { AppRouter } from "../../../api/router";

type OppRow = inferRouterOutputs<AppRouter>["crm"]["opportunity"]["list"][number];
type OppPatch = inferRouterInputs<AppRouter>["crm"]["opportunity"]["update"]["patch"];
type OppStage = NonNullable<OppPatch["stage"]>;

/** 阶段选项：由 OPP_STAGE_META 生成（键序即漏斗顺序，与后端 CMD_OPP_STAGES 一致） */
const STAGE_OPTIONS = Object.entries(OPP_STAGE_META).map(([value, m]) => ({
  value,
  zh: m.zh,
  en: m.en,
}));
const STAGE_ORDER = Object.keys(OPP_STAGE_META);
const TERMINAL_STAGES: readonly string[] = ["won", "lost"];

/** 停滞阈值（天）：与后端 opportunity.summary 的 staleCount 口径保持一致 */
const STALE_DAYS = 14;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const nf = new Intl.NumberFormat("zh-CN");

/* ------------------------------------------------------------------ */
/* 取值 / 转换工具                                                      */
/* ------------------------------------------------------------------ */

/** 距上次活动的停滞天数；无活动记录时返回 null（显示 —） */
function staleDays(v: Date | null): number | null {
  if (!v) return null;
  const ms = Date.now() - new Date(v).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

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

function stageText(stage: string): string {
  const m = OPP_STAGE_META[stage];
  return m ? dual(m.zh, m.en) : stage;
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

export function OpportunitiesTable({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: oppData, isLoading, refetch } = trpc.crm.opportunity.list.useQuery({});
  const { data: accountData, refetch: refetchAccounts } = trpc.crm.account.list.useQuery();
  const [open, setOpen] = React.useState<OppRow | null>(null);

  const update = trpc.crm.opportunity.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", "opportunity", "list"] }),
  });

  const rows = oppData ?? [];

  const accountMap = React.useMemo(() => {
    const m = new Map<number, string>();
    (accountData ?? []).forEach((a) => m.set(a.id, a.name));
    return m;
  }, [accountData]);

  const accountName = React.useCallback(
    (id: number) => accountMap.get(id) ?? `#${id}`,
    [accountMap],
  );

  /** 行内编辑：只映射到 opportunity.update 支持的字段，其余（如项目名/客户）直接忽略 */
  const save = async (row: OppRow, key: string, value: unknown) => {
    const patch: OppPatch = {};
    switch (key) {
      case "stage": {
        const s = asText(value);
        if (!s || !STAGE_ORDER.includes(s)) return;
        if (s === "lost") {
          // 后端约定：输单必须带原因，否则 BAD_REQUEST
          const reason = window.prompt("输单原因（必填）")?.trim();
          if (!reason) return;
          patch.lostReason = reason;
        }
        patch.stage = s as OppStage;
        break;
      }
      case "amountCny":
        patch.amountCny = asNumber(value);
        break;
      case "probability": {
        const n = asNumber(value);
        patch.probability = n === null ? null : Math.min(100, Math.max(0, Math.round(n)));
        break;
      }
      case "expectedClose": {
        const d = dayOrAbort(value);
        if (!d.ok) {
          window.alert("日期格式需为 YYYY-MM-DD（留空则清空）");
          return;
        }
        patch.expectedClose = d.value;
        break;
      }
      case "nextAction":
        patch.nextAction = asText(value);
        break;
      case "nextActionDue": {
        const d = dayOrAbort(value);
        if (!d.ok) {
          window.alert("日期格式需为 YYYY-MM-DD（留空则清空）");
          return;
        }
        patch.nextActionDue = d.value;
        break;
      }
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

  const columns: Column<OppRow>[] = [
    {
      key: "accountId", zh: "客户", en: "Account", type: "text", width: 180,
      filterable: true, searchable: false,
      value: (r) => accountName(r.accountId),
    },
    {
      key: "title", zh: "项目名", en: "Project", type: "text", width: 220,
      value: (r) => r.title,
    },
    {
      key: "stage", zh: "阶段", en: "Stage", type: "enum", width: 150,
      options: STAGE_OPTIONS, filterable: true, editable: true,
      value: (r) => r.stage,
      sortValue: (r) => STAGE_ORDER.indexOf(r.stage),
      render: (r) => {
        const m = OPP_STAGE_META[r.stage];
        return (
          <Badge
            variant={r.stage === "lost" ? "outline" : TERMINAL_STAGES.includes(r.stage) ? "secondary" : "default"}
            title={m?.en}
          >
            {dual(m?.zh ?? r.stage, m?.en)}
          </Badge>
        );
      },
    },
    {
      key: "amountCny", zh: "金额", en: "Amount", type: "money", width: 130,
      align: "right", editable: true,
      value: (r) => r.amountCny,
      sortValue: (r) => (r.amountCny === null ? null : Number(r.amountCny)),
    },
    {
      key: "probability", zh: "概率(%)", en: "Probability", type: "number", width: 90,
      align: "right", editable: true,
      value: (r) => r.probability,
      render: (r) =>
        r.probability === null ? (
          <span className="opacity-30">—</span>
        ) : (
          <span className="tabular-nums">{r.probability}%</span>
        ),
    },
    {
      key: "expectedClose", zh: "预计成交", en: "Expected close", type: "date", width: 110,
      editable: true, value: (r) => r.expectedClose,
    },
    {
      key: "nextAction", zh: "下一步", en: "Next action", type: "text", width: 200,
      editable: true, searchable: false, value: (r) => r.nextAction,
    },
    {
      key: "nextActionDue", zh: "下一步到期", en: "Next action due", type: "date", width: 120,
      editable: true, value: (r) => r.nextActionDue,
    },
    {
      key: "tags", zh: "标签", en: "Tags", type: "tags", width: 180,
      editable: true, value: (r) => r.tags,
    },
    {
      key: "memo", zh: "备注", en: "Memo", type: "longtext", width: 260,
      editable: true, value: (r) => r.memo,
    },
    {
      key: "staleDays", zh: "停滞天数", en: "Stale days", type: "number", width: 100,
      align: "right",
      value: (r) => staleDays(r.lastActivityAt),
      sortValue: (r) => staleDays(r.lastActivityAt),
      render: (r) => {
        const d = staleDays(r.lastActivityAt);
        if (d === null) return <span className="opacity-30">—</span>;
        return (
          <span
            className={d >= STALE_DAYS ? "tabular-nums font-medium text-destructive" : "tabular-nums"}
            title={r.lastActivityAt ? `上次活动：${new Date(r.lastActivityAt).toLocaleString("zh-CN", { hour12: false })}` : "暂无活动记录"}
          >
            {d}
          </span>
        );
      },
    },
  ];

  // 抽屉始终取最新行，行内编辑后详情同步刷新
  const current = open ? rows.find((r) => r.id === open.id) ?? open : null;

  return (
    <>
      <DataTable<OppRow>
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(r) => r.id}
        storageKey="opportunities"
        exportName="商机"
        emptyTitle="还没有商机"
        emptyHint="从「客户卡」或「商机管道」页新建商机"
        onRowClick={(r) => setOpen(r)}
        onCellEdit={isAdmin ? save : undefined}
        onRefresh={() => {
          void refetch();
          void refetchAccounts();
        }}
        initialSort={{ key: "amountCny", dir: "desc" }}
      />

      <Drawer open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>{current?.title}</DrawerTitle>
            <DrawerDescription>
              {current && (
                <>
                  {accountName(current.accountId)} · {stageText(current.stage)}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>
          {current && <OpportunityDetail opp={current} accountName={accountName(current.accountId)} />}
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

function OpportunityDetail({ opp, accountName }: { opp: OppRow; accountName: string }) {
  const m = OPP_STAGE_META[opp.stage];
  const days = staleDays(opp.lastActivityAt);
  const tags = (opp.tags ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4 overflow-auto px-4 pb-6 text-sm">
      <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5">
        <Field label="客户">{accountName}</Field>
        <Field label="项目名">{opp.title}</Field>
        <Field label="阶段">
          <Badge variant="outline" title={m?.en}>
            {dual(m?.zh ?? opp.stage, m?.en)}
          </Badge>
        </Field>
        <Field label="金额">{money(opp.amountCny)}</Field>
        <Field label="概率">{opp.probability === null ? "—" : `${opp.probability}%`}</Field>
        <Field label="预计成交">{opp.expectedClose ?? "—"}</Field>
        <Field label="下一步">{opp.nextAction || "—"}</Field>
        <Field label="下一步到期">{opp.nextActionDue ?? "—"}</Field>
        <Field label="停滞天数">{days === null ? "—" : `${days} 天`}</Field>
        <Field label="最近活动">
          {opp.lastActivityAt
            ? new Date(opp.lastActivityAt).toLocaleString("zh-CN", { hour12: false })
            : "—"}
        </Field>
        <Field label="标签">
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
        {opp.wonAt && <Field label="赢单日期">{opp.wonAt}</Field>}
        {opp.lostReason && <Field label="输单原因">{opp.lostReason}</Field>}
        <Field label="来源">{opp.source || "—"}</Field>
        <Field label="创建时间">
          {opp.createdAt ? new Date(opp.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—"}
        </Field>
      </dl>

      <section>
        <div className="mb-1 text-xs font-medium opacity-60">备注</div>
        <div className="whitespace-pre-wrap opacity-80">{opp.memo || "—"}</div>
      </section>
    </div>
  );
}
