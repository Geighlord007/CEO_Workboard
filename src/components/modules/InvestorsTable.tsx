import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { DataTable, type Column, type ColumnOption } from "@/components/table/DataTable";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE_FLOW, STAGE_LABELS, STAGE_LABELS_EN, dual, stageIndex } from "@contracts/crm";

/* ------------------------------------------------------------------ */
/* 行类型：对应 db/schema.ts 的 investors 表（只声明本表用到的字段）    */
/* ------------------------------------------------------------------ */

export interface InvestorRow {
  id: number;
  name: string;
  firm: string | null;
  round: string | null;
  stage: string;
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  emailKind: string | null;
  contactLinkedin: string | null;
  /** 首次接触日期（本轮起点） */
  firstContactAt: string | null;
  lastContactAt: string | null;
  nextAction: string | null;
  /** 沟通记录/进展（最近要点） */
  progressNote: string | null;
  /** 引荐人/来源 */
  referral: string | null;
  /** 导入溯源（默认隐藏） */
  importNote: string | null;
  tags: string | null;
  memo: string | null;
}

/* ------------------------------------------------------------------ */
/* 枚举：阶段 / 邮箱状态                                               */
/* ------------------------------------------------------------------ */

/** 投资人阶段（进行中 + 终态，含新档 to_contact） */
const STAGE_OPTIONS: ColumnOption[] = [
  ...STAGE_FLOW.investor.stages,
  ...STAGE_FLOW.investor.terminal,
].map((s) => ({
  value: s,
  zh: STAGE_LABELS.investor[s] ?? s,
  en: STAGE_LABELS_EN.investor[s],
}));

/** 邮箱状态：verified 已核实 / unverified 未核实 / linkedin（该行邮箱列实为领英私信） */
const EMAIL_KIND_META: Record<string, { zh: string; en: string; cls: string }> = {
  verified: {
    zh: "已验证",
    en: "Verified",
    cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  unverified: {
    zh: "未验证",
    en: "Unverified",
    cls: "border-border bg-muted text-muted-foreground",
  },
  linkedin: {
    zh: "仅领英",
    en: "LinkedIn only",
    cls: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
};

function EmailKindBadge({ kind }: { kind: string | null }) {
  if (!kind) return <span className="opacity-30">—</span>;
  const m = EMAIL_KIND_META[kind];
  if (!m) return <Badge variant="outline">{kind}</Badge>;
  return (
    <Badge variant="outline" className={m.cls} title={m.en}>
      {dual(m.zh, m.en)}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* 标签解析：tags 里以「类别: / 地区: / 偏好: / 支票:」开头的项         */
/* ------------------------------------------------------------------ */

/** tags → 数组（兼容中英文逗号） */
function tagList(tags: string | null): string[] {
  return (tags ?? "")
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 取「前缀: 值」形式标签的值（兼容全角冒号） */
function tagValues(tags: string | null, prefixes: string[]): string[] {
  const out: string[] = [];
  for (const t of tagList(tags)) {
    for (const p of prefixes) {
      if (t.startsWith(`${p}:`) || t.startsWith(`${p}：`)) {
        const v = t.slice(p.length + 1).trim();
        if (v) out.push(v);
        break;
      }
    }
  }
  return out;
}

/** 单元格里的标签 Badge（超过 3 个折叠为 +N） */
function TagBadges({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="opacity-30">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 3).map((t) => (
        <Badge key={t} variant="secondary" className="font-normal" title={t}>
          {t}
        </Badge>
      ))}
      {items.length > 3 && <span className="text-xs opacity-50">+{items.length - 3}</span>}
    </div>
  );
}

/** 赛道：优先「类别:」标签，无则回落到全部标签 */
function sliceTagItems(tags: string | null): string[] {
  const cat = tagValues(tags, ["类别"]);
  return cat.length > 0 ? cat : tagList(tags);
}

/* ------------------------------------------------------------------ */
/* 点击即改的枚举单元格                                                 */
/* DataTable 内置的枚举编辑在 onValueChange 里读到的是上一次渲染的      */
/* draft（stale closure），会静默丢弃选择；这里用单元格自身状态直接提交，*/
/* 不改动通用组件。                                                     */
/* ------------------------------------------------------------------ */

function EnumCell({
  value,
  options,
  editable,
  variant = "outline",
  onCommit,
}: {
  value: string | null;
  options: ColumnOption[];
  editable: boolean;
  variant?: "default" | "secondary" | "outline";
  onCommit: (next: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const meta = options.find((o) => o.value === (value ?? ""));
  const label = meta ? dual(meta.zh, meta.en) : (value ?? "");

  const badge = value ? (
    <Badge variant={variant} title={meta?.en}>
      {label}
    </Badge>
  ) : (
    <span className="opacity-40">—</span>
  );

  if (!editable) return badge;
  if (!editing) {
    return (
      <button
        type="button"
        className="cursor-pointer"
        title="点击修改"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        {badge}
      </button>
    );
  }
  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => {
        setEditing(false);
        void onCommit(next);
      }}
    >
      <SelectTrigger className="h-7 w-full text-xs" onClick={(e) => e.stopPropagation()}>
        <SelectValue placeholder="选择…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {dual(o.zh, o.en)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ------------------------------------------------------------------ */
/* 表                                                                  */
/* ------------------------------------------------------------------ */

export function InvestorsTable({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = trpc.crm.investor.list.useQuery();
  const [open, setOpen] = React.useState<InvestorRow | null>(null);

  const update = trpc.crm.investor.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", "investor", "list"] }),
  });

  const rows: InvestorRow[] = data ?? [];

  /** 抽屉始终取最新一行，行内编辑后详情不残留旧值 */
  const opened = React.useMemo(
    () => (open ? (rows.find((r) => r.id === open.id) ?? open) : null),
    [open, rows],
  );

  /** 统一的写回入口（只提交 investor.update 支持的字段） */
  const patchCell = async (row: InvestorRow, key: string, value: unknown) => {
    try {
      await update.mutateAsync({ id: row.id, patch: { [key]: value } as never });
    } catch (err) {
      // 项目未挂载全局 toast，失败时保留旧值并打日志
      console.error("[投资人] 保存失败", key, err);
    }
  };

  const columns: Column<InvestorRow>[] = [
    {
      key: "name", zh: "机构名", en: "Name", type: "text", width: 200,
      value: (r) => r.name,
    },
    {
      key: "round", zh: "轮次", en: "Round", type: "text", width: 110,
      filterable: true, editable: true,
      value: (r) => r.round,
    },
    {
      key: "stage", zh: "阶段", en: "Stage", type: "enum", width: 140,
      options: STAGE_OPTIONS, filterable: true,
      value: (r) => r.stage,
      sortValue: (r) => stageIndex("investor", r.stage),
      render: (r) => (
        <EnumCell
          value={r.stage}
          options={STAGE_OPTIONS}
          editable={isAdmin}
          variant={STAGE_FLOW.investor.terminal.includes(r.stage) ? "secondary" : "default"}
          onCommit={(next) => patchCell(r, "stage", next)}
        />
      ),
    },
    {
      key: "category", zh: "赛道", en: "Slices", type: "tags", width: 180,
      value: (r) => {
        const cat = tagValues(r.tags, ["类别"]);
        return cat.length > 0 ? cat.join(", ") : (r.tags ?? "");
      },
      render: (r) => <TagBadges items={sliceTagItems(r.tags)} />,
    },
    {
      key: "region", zh: "地区", en: "Region", type: "tags", width: 140,
      value: (r) => tagValues(r.tags, ["地区"]).join(", "),
      render: (r) => <TagBadges items={tagValues(r.tags, ["地区"])} />,
    },
    {
      key: "preference", zh: "偏好/支票", en: "Preference / check", type: "tags", width: 180,
      value: (r) => tagValues(r.tags, ["偏好", "支票"]).join(", "),
      render: (r) => <TagBadges items={tagValues(r.tags, ["偏好", "支票"])} />,
    },
    {
      key: "firstContactAt", zh: "首次接触", en: "First contact", type: "date", width: 110,
      editable: true,
      value: (r) => r.firstContactAt,
    },
    {
      key: "lastContactAt", zh: "最近沟通", en: "Last contact", type: "date", width: 110,
      editable: true,
      value: (r) => r.lastContactAt,
    },
    {
      key: "progressNote", zh: "沟通记录/进展", en: "Progress note", type: "longtext", width: 260,
      editable: true,
      value: (r) => r.progressNote,
      render: (r) =>
        r.progressNote ? (
          <span
            className="line-clamp-2 max-w-[280px] whitespace-pre-wrap"
            title={r.progressNote}
          >
            {r.progressNote}
          </span>
        ) : (
          <span className="opacity-30">—</span>
        ),
    },
    {
      key: "nextAction", zh: "下一步", en: "Next action", type: "text", width: 180,
      editable: true,
      value: (r) => r.nextAction,
    },
    {
      key: "contactName", zh: "对接人", en: "Contact", type: "text", width: 120,
      editable: true,
      value: (r) => r.contactName,
    },
    {
      key: "contactTitle", zh: "职级", en: "Title", type: "text", width: 140,
      editable: true,
      value: (r) => r.contactTitle,
    },
    {
      key: "contactEmail", zh: "邮箱/验证", en: "Email / status", type: "text", width: 220,
      editable: true,
      value: (r) => r.contactEmail,
      render: (r) =>
        r.contactEmail || r.emailKind ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="break-all">{r.contactEmail ?? "—"}</span>
            {r.emailKind && <EmailKindBadge kind={r.emailKind} />}
          </span>
        ) : (
          <span className="opacity-30">—</span>
        ),
    },
    {
      key: "referral", zh: "引荐人", en: "Referral", type: "text", width: 140,
      editable: true,
      value: (r) => r.referral,
    },
    {
      key: "memo", zh: "备注", en: "Memo", type: "longtext", width: 280,
      editable: true,
      value: (r) => r.memo,
    },
    {
      key: "importNote", zh: "导入溯源", en: "Import note", type: "longtext", width: 220,
      hiddenByDefault: true, searchable: false,
      value: (r) => r.importNote,
    },
    {
      key: "tags", zh: "标签", en: "Tags", type: "tags", width: 200,
      editable: true, hiddenByDefault: true,
      value: (r) => r.tags,
    },
  ];

  return (
    <>
      <DataTable<InvestorRow>
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(r) => r.id}
        storageKey="investors"
        exportName="投资人"
        emptyTitle="还没有投资人/基金记录"
        emptyHint="数据来自融资表，可在此维护对接人与推进状态"
        onRowClick={(r) => setOpen(r)}
        onRefresh={() => void refetch()}
        onCellEdit={
          isAdmin
            ? async (row, key, value) => {
                await patchCell(row, key, value);
              }
            : undefined
        }
        initialSort={{ key: "name", dir: "asc" }}
      />

      <Drawer open={!!opened} onOpenChange={(v) => !v && setOpen(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>{opened?.name}</DrawerTitle>
            <DrawerDescription>
              {opened && (
                <>
                  {opened.round ?? "—"} ·{" "}
                  {dual(
                    STAGE_LABELS.investor[opened.stage] ?? opened.stage,
                    STAGE_LABELS_EN.investor[opened.stage],
                  )}{" "}
                  · {opened.contactName ?? "暂无对接人"}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>
          {opened && <InvestorDetail investor={opened} />}
        </DrawerContent>
      </Drawer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 详情抽屉                                                            */
/* ------------------------------------------------------------------ */

function InvestorDetail({ investor }: { investor: InvestorRow }) {
  const terminal = STAGE_FLOW.investor.terminal.includes(investor.stage);
  return (
    <div className="space-y-4 overflow-auto px-4 pb-6 text-sm">
      <section className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="轮次 (Round)">{investor.round ?? "—"}</Field>
        <Field label="阶段 (Stage)">
          <Badge variant={terminal ? "secondary" : "default"}>
            {dual(
              STAGE_LABELS.investor[investor.stage] ?? investor.stage,
              STAGE_LABELS_EN.investor[investor.stage],
            )}
          </Badge>
        </Field>
        <Field label="基金/机构 (Firm)">{investor.firm ?? "—"}</Field>
        <Field label="赛道 (Slices)">
          <TagList value={sliceTagItems(investor.tags).join(", ")} />
        </Field>
        <Field label="地区 (Region)">
          <TagList value={tagValues(investor.tags, ["地区"]).join(", ")} />
        </Field>
        <Field label="偏好/支票 (Preference)">
          <TagList value={tagValues(investor.tags, ["偏好", "支票"]).join(", ")} />
        </Field>
        <Field label="对接人 (Contact)">{investor.contactName ?? "—"}</Field>
        <Field label="职级 (Title)">{investor.contactTitle ?? "—"}</Field>
        <Field label="邮箱 (Email)">
          <span className="break-all">{investor.contactEmail ?? "—"}</span>
          {investor.emailKind && (
            <span className="ml-1.5 inline-block align-middle">
              <EmailKindBadge kind={investor.emailKind} />
            </span>
          )}
        </Field>
        <Field label="LinkedIn">
          {investor.contactLinkedin ? (
            <a
              href={
                investor.contactLinkedin.startsWith("http")
                  ? investor.contactLinkedin
                  : `https://${investor.contactLinkedin}`
              }
              target="_blank"
              rel="noreferrer"
              className="break-all underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              {investor.contactLinkedin}
            </a>
          ) : (
            "—"
          )}
        </Field>
        <Field label="首次接触 (First contact)">{investor.firstContactAt ?? "—"}</Field>
        <Field label="最近沟通 (Last contact)">{investor.lastContactAt ?? "—"}</Field>
        <Field label="下一步 (Next action)">{investor.nextAction ?? "—"}</Field>
        <Field label="标签 (Tags)">
          <TagList value={investor.tags} />
        </Field>
        {investor.importNote && (
          <Field label="导入溯源 (Import note)">{investor.importNote}</Field>
        )}
      </section>

      <section>
        <div className="mb-1 text-xs font-medium opacity-60">沟通记录/进展 (Progress note)</div>
        <div className="whitespace-pre-wrap break-words opacity-80">{investor.progressNote || "—"}</div>
      </section>

      <section>
        <div className="mb-1 text-xs font-medium opacity-60">备注全文 (Memo)</div>
        <div className="whitespace-pre-wrap break-words opacity-80">{investor.memo || "—"}</div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium opacity-60">{label}</div>
      <div className="mt-0.5 break-words">{children}</div>
    </div>
  );
}

function TagList({ value }: { value: string | null }) {
  const parts = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return <span className="opacity-30">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((t) => (
        <Badge key={t} variant="secondary" className="font-normal">
          {t}
        </Badge>
      ))}
    </div>
  );
}
