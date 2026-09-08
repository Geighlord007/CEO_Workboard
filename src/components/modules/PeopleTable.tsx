import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { DataTable, type Column, type ColumnOption } from "@/components/table/DataTable";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { FollowupSection } from "@/components/modules/FollowupsPage";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTACT_ROLE_META, OUTREACH_STAGE_META, dual } from "@contracts/crm";

/* ------------------------------------------------------------------ */
/* 行类型：对应 db/schema.ts 的 contacts 表（只声明本表用到的字段）     */
/* ------------------------------------------------------------------ */

export interface PeopleRow {
  id: number;
  accountId: number | null;
  name: string;
  title: string | null;
  roleType: string | null;
  email: string | null;
  emailKind: string | null;
  linkedinUrl: string | null;
  referral: string | null;
  outreachStage: string | null;
  tags: string | null;
  lastContactAt: string | null;
  wechat: string | null;
  phone: string | null;
  memo: string | null;
  /** 所属机构（原文；有 accountId 时表示当前挂靠机构） */
  affiliation: string | null;
  /** 导入溯源（默认隐藏） */
  importNote: string | null;
  /** 来源（默认隐藏） */
  externalSource: string | null;
}

/* ------------------------------------------------------------------ */
/* 枚举：角色 / 外联状态 / 邮箱状态                                     */
/* ------------------------------------------------------------------ */

const ROLE_OPTIONS: ColumnOption[] = Object.entries(CONTACT_ROLE_META).map(([value, m]) => ({
  value,
  zh: m.zh,
  en: m.en,
}));

const OUTREACH_OPTIONS: ColumnOption[] = Object.entries(OUTREACH_STAGE_META).map(([value, m]) => ({
  value,
  zh: m.zh,
  en: m.en,
}));

/** 邮箱状态：verified 已核实 / unverified 未核实 / linkedin（邮箱列实为领英私信） */
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
/* 机构：affiliation 原文优先；accountId 有值回落机构表名；再回落 memo  */
/* ------------------------------------------------------------------ */

const ORG_RE = /\[(?:归属|机构)\]\s*([^\n\r]+)/;

function orgFromMemo(memo: string | null): string | null {
  if (!memo) return null;
  const m = memo.match(ORG_RE);
  return m ? m[1].trim() : null;
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

export function PeopleTable({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = trpc.crm.contact.list.useQuery();
  const { data: accounts, isLoading: accountsLoading } = trpc.crm.account.list.useQuery();
  const [open, setOpen] = React.useState<PeopleRow | null>(null);

  const update = trpc.crm.contact.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", "contact", "list"] }),
  });

  const rows: PeopleRow[] = data ?? [];

  const orgMap = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const a of accounts ?? []) m.set(a.id, a.name);
    return m;
  }, [accounts]);

  /** 机构名：affiliation 原文优先；否则 accountId 命中机构表；再回落 memo 的 [归属]/[机构] */
  const orgOf = React.useCallback(
    (r: PeopleRow): string | null => {
      if (r.affiliation && r.affiliation.trim()) return r.affiliation.trim();
      if (r.accountId) {
        const named = orgMap.get(r.accountId);
        if (named) return named;
      }
      return orgFromMemo(r.memo);
    },
    [orgMap],
  );

  /** 抽屉始终取最新一行，行内编辑后详情不残留旧值 */
  const opened = React.useMemo(
    () => (open ? (rows.find((r) => r.id === open.id) ?? open) : null),
    [open, rows],
  );

  const stats = React.useMemo(() => {
    const list = data ?? [];
    let toContact = 0;
    let advancing = 0;
    for (const r of list) {
      if (r.outreachStage === "toContact") toContact += 1;
      else if (r.outreachStage === "invited" || r.outreachStage === "meeting" || r.outreachStage === "engaging") {
        advancing += 1;
      }
    }
    return { total: list.length, toContact, advancing };
  }, [data]);

  /** 统一的写回入口（只提交 contact.update 支持的字段） */
  const patchCell = async (row: PeopleRow, key: string, value: unknown) => {
    // 姓名是必填，清空会被后端拒绝，这里直接忽略
    if (key === "name" && !String(value ?? "").trim()) return;
    try {
      await update.mutateAsync({ id: row.id, patch: { [key]: value } as never });
    } catch (err) {
      // 项目未挂载全局 toast，失败时保留旧值并打日志
      console.error("[人脉] 保存失败", key, err);
    }
  };

  /** 方向标签筛选项：把 tags 拆成单个标签去重（含「候选池」标记），按出现次数排序 */
  const tagOptions: ColumnOption[] = React.useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows) {
      for (const p of (r.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
        count.set(p, (count.get(p) ?? 0) + 1);
      }
    }
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value]) => ({ value, zh: value }));
  }, [rows]);

  const columns: Column<PeopleRow>[] = [
    {
      key: "tags", zh: "方向标签", en: "Direction tags", type: "tags", width: 180,
      editable: true, searchable: true, filterable: true, options: tagOptions,
      value: (r) => r.tags,
    },
    {
      key: "name", zh: "姓名", en: "Name", type: "text", width: 140,
      editable: true, searchable: true,
      value: (r) => r.name,
    },
    {
      key: "roleType", zh: "角色", en: "Role", type: "enum", width: 130,
      options: ROLE_OPTIONS, filterable: true,
      value: (r) => r.roleType,
      sortValue: (r) => Object.keys(CONTACT_ROLE_META).indexOf(r.roleType ?? ""),
      render: (r) => (
        <EnumCell
          value={r.roleType}
          options={ROLE_OPTIONS}
          editable={isAdmin}
          onCommit={(next) => patchCell(r, "roleType", next)}
        />
      ),
    },
    {
      key: "affiliation", zh: "机构", en: "Organization", type: "text", width: 160,
      editable: true, searchable: true, filterable: true,
      value: (r) => orgOf(r),
    },
    {
      key: "title", zh: "职位", en: "Title", type: "text", width: 180,
      editable: true, searchable: false,
      value: (r) => r.title,
    },
    {
      key: "email", zh: "邮箱", en: "Email", type: "text", width: 220,
      editable: true, searchable: false,
      value: (r) => r.email,
      render: (r) =>
        r.email || r.emailKind ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="break-all">{r.email ?? "—"}</span>
            {r.emailKind && <EmailKindBadge kind={r.emailKind} />}
          </span>
        ) : (
          <span className="opacity-30">—</span>
        ),
    },
    {
      key: "linkedinUrl", zh: "领英", en: "LinkedIn", type: "link", width: 160,
      searchable: false,
      value: (r) => r.linkedinUrl,
    },
    {
      key: "referral", zh: "引荐人", en: "Referral", type: "text", width: 110,
      editable: true, searchable: false,
      value: (r) => r.referral,
    },
    {
      key: "outreachStage", zh: "外联状态", en: "Outreach", type: "enum", width: 130,
      options: OUTREACH_OPTIONS, filterable: true,
      value: (r) => r.outreachStage,
      sortValue: (r) => Object.keys(OUTREACH_STAGE_META).indexOf(r.outreachStage ?? ""),
      render: (r) => (
        <EnumCell
          value={r.outreachStage}
          options={OUTREACH_OPTIONS}
          editable={isAdmin}
          variant={
            r.outreachStage === "signed"
              ? "default"
              : r.outreachStage === "closed"
                ? "secondary"
                : "outline"
          }
          onCommit={(next) => patchCell(r, "outreachStage", next)}
        />
      ),
    },
    {
      key: "lastContactAt", zh: "最近联系", en: "Last contact", type: "date", width: 110,
      editable: true,
      value: (r) => r.lastContactAt,
    },
    {
      key: "memo", zh: "备注", en: "Memo", type: "longtext", width: 280,
      editable: true, searchable: true,
      value: (r) => r.memo,
    },
    {
      key: "importNote", zh: "导入溯源", en: "Import note", type: "longtext", width: 220,
      hiddenByDefault: true, searchable: false,
      value: (r) => r.importNote,
    },
    {
      key: "externalSource", zh: "来源", en: "Source", type: "text", width: 120,
      hiddenByDefault: true, searchable: false,
      value: (r) => r.externalSource,
    },
  ];

  return (
    <>
      <DataTable<PeopleRow>
        columns={columns}
        rows={rows}
        loading={isLoading || accountsLoading}
        rowKey={(r) => r.id}
        storageKey="people"
        exportName="人脉"
        emptyTitle="人脉簿还是空的"
        emptyHint="从导入表或客户卡新增联系人"
        onRowClick={(r) => setOpen(r)}
        onRefresh={() => void refetch()}
        toolbarExtra={
          <span className="whitespace-nowrap">
            共 {stats.total} 人 · 待触达 {stats.toContact} · 推进中 {stats.advancing}
          </span>
        }
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
                  {opened.title ?? "—"} · {orgOf(opened) ?? "无机构挂靠"} ·{" "}
                  {opened.outreachStage
                    ? dual(
                        OUTREACH_STAGE_META[opened.outreachStage]?.zh ?? opened.outreachStage,
                        OUTREACH_STAGE_META[opened.outreachStage]?.en,
                      )
                    : "未分外联状态"}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>
          {opened && <PeopleDetail person={opened} org={orgOf(opened)} />}
          {opened && (
            <div className="px-4 pb-6">
              <FollowupSection
                entityType="contact"
                entityId={opened.id}
                entityName={opened.name}
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

function PeopleDetail({ person, org }: { person: PeopleRow; org: string | null }) {
  const role = person.roleType ? CONTACT_ROLE_META[person.roleType] : undefined;
  const outreach = person.outreachStage ? OUTREACH_STAGE_META[person.outreachStage] : undefined;
  return (
    <div className="space-y-4 overflow-auto px-4 pb-6 text-sm">
      <section className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="机构 (Organization)">
          {org ?? "—"}
          {person.affiliation && person.accountId ? (
            <span className="ml-1 opacity-50">（原文：{person.affiliation}）</span>
          ) : null}
        </Field>
        <Field label="职位 (Title)">{person.title ?? "—"}</Field>
        <Field label="角色 (Role)">
          {role ? <Badge variant="outline">{dual(role.zh, role.en)}</Badge> : <span className="opacity-30">—</span>}
        </Field>
        <Field label="外联状态 (Outreach)">
          {outreach ? (
            <Badge variant={person.outreachStage === "signed" ? "default" : "outline"}>
              {dual(outreach.zh, outreach.en)}
            </Badge>
          ) : (
            <span className="opacity-30">—</span>
          )}
        </Field>
        <Field label="邮箱 (Email)">
          <span className="break-all">{person.email ?? "—"}</span>
          {person.emailKind && (
            <span className="ml-1.5 inline-block align-middle">
              <EmailKindBadge kind={person.emailKind} />
            </span>
          )}
        </Field>
        <Field label="领英 (LinkedIn)">
          {person.linkedinUrl ? (
            <a
              href={person.linkedinUrl.startsWith("http") ? person.linkedinUrl : `https://${person.linkedinUrl}`}
              target="_blank"
              rel="noreferrer"
              className="break-all underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              {person.linkedinUrl}
            </a>
          ) : (
            "—"
          )}
        </Field>
        <Field label="引荐人 (Referral)">{person.referral ?? "—"}</Field>
        <Field label="微信 (WeChat)">{person.wechat ?? "—"}</Field>
        <Field label="电话 (Phone)">{person.phone ?? "—"}</Field>
        <Field label="最近联系 (Last contact)">{person.lastContactAt ?? "—"}</Field>
        <Field label="方向标签 (Tags)">
          <TagList value={person.tags} />
        </Field>
        {person.externalSource && (
          <Field label="来源 (Source)">{person.externalSource}</Field>
        )}
        {person.importNote && (
          <Field label="导入溯源 (Import note)">{person.importNote}</Field>
        )}
      </section>

      <section>
        <div className="mb-1 text-xs font-medium opacity-60">备注全文 (Memo)</div>
        <div className="whitespace-pre-wrap break-words opacity-80">{person.memo || "—"}</div>
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
