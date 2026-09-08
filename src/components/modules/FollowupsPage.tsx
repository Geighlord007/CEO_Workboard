/* eslint-disable react-refresh/only-export-components -- 本文件同时导出跟进页组件/抽屉区/元数据常量，与 ui/* 基线一致 */
/**
 * 跟进记录（followups 表）：一条跟进 = 一行，用 entityType+entityId 挂回四张业务表
 * - FollowupsPage：各模块「跟进」子页（只看本模块实体类型）+ 顶部快速记一笔
 * - FollowupSection：嵌在各业务表行抽屉里（看这一行的跟进 + 记跟进按钮）
 * - 看板「最近跟进」卡片另见 dash/FollowupsCard
 */
import * as React from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/providers/trpc";
import { DataTable, type Column, type ColumnOption } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { todayStr } from "@/lib/dates";
import type { AppRouter } from "../../../api/router";

type FollowupRow = inferRouterOutputs<AppRouter>["crm"]["followup"]["list"][number];
/** 实体类型联合（取自路由输入 zod enum；表里 entityType 列是 varchar，输出侧为 string） */
export type FollowupEntityType = inferRouterInputs<AppRouter>["crm"]["followup"]["create"]["entityType"];

export const FOLLOWUP_ENTITY_META: Record<FollowupEntityType, { zh: string; en: string }> = {
  account: { zh: "客户", en: "Client" },
  supplier: { zh: "供应商", en: "Supplier" },
  investor: { zh: "投资人", en: "Investor" },
  contact: { zh: "人脉", en: "Contact" },
};

const ENTITY_OPTIONS: ColumnOption[] = Object.entries(FOLLOWUP_ENTITY_META).map(([value, m]) => ({
  value,
  zh: m.zh,
  en: m.en,
}));

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/* 实体名称映射（entityType:entityId → 名字）                           */
/* ------------------------------------------------------------------ */

export function useFollowupNames(types: FollowupEntityType[]) {
  const acc = trpc.crm.account.list.useQuery(undefined, { enabled: types.includes("account") });
  const sup = trpc.crm.supplier.list.useQuery(undefined, { enabled: types.includes("supplier") });
  const inv = trpc.crm.investor.list.useQuery(undefined, { enabled: types.includes("investor") });
  const con = trpc.crm.contact.list.useQuery(undefined, { enabled: types.includes("contact") });

  return React.useMemo(() => {
    const m = new Map<string, string>();
    if (types.includes("account")) (acc.data ?? []).forEach((r) => m.set(`account:${r.id}`, r.name));
    if (types.includes("supplier")) (sup.data ?? []).forEach((r) => m.set(`supplier:${r.id}`, r.name));
    if (types.includes("investor")) (inv.data ?? []).forEach((r) => m.set(`investor:${r.id}`, r.name));
    if (types.includes("contact")) (con.data ?? []).forEach((r) => m.set(`contact:${r.id}`, r.name));
    return m;
  }, [types, acc.data, sup.data, inv.data, con.data]);
}

/** 某类型下的「名字 → id」候选（快速记跟进时用） */
function useEntityCandidates(type: FollowupEntityType) {
  const acc = trpc.crm.account.list.useQuery(undefined, { enabled: type === "account" });
  const sup = trpc.crm.supplier.list.useQuery(undefined, { enabled: type === "supplier" });
  const inv = trpc.crm.investor.list.useQuery(undefined, { enabled: type === "investor" });
  const con = trpc.crm.contact.list.useQuery(undefined, { enabled: type === "contact" });

  return React.useMemo(() => {
    const list: { id: number; name: string }[] = [];
    if (type === "account") (acc.data ?? []).forEach((r) => list.push({ id: r.id, name: r.name }));
    if (type === "supplier") (sup.data ?? []).forEach((r) => list.push({ id: r.id, name: r.name }));
    if (type === "investor") (inv.data ?? []).forEach((r) => list.push({ id: r.id, name: r.name }));
    if (type === "contact") (con.data ?? []).forEach((r) => list.push({ id: r.id, name: r.name }));
    return list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [type, acc.data, sup.data, inv.data, con.data]);
}

/* ------------------------------------------------------------------ */
/* 记跟进弹窗                                                          */
/* ------------------------------------------------------------------ */

export function FollowupDialog({
  open, onOpenChange, entityType, entityId, entityName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: FollowupEntityType;
  entityId: number;
  entityName: string;
}) {
  const utils = trpc.useUtils();
  const create = trpc.crm.followup.create.useMutation({
    onSuccess: () => {
      void utils.crm.followup.list.invalidate();
      toast.success("跟进已记录");
      setTitle("");
      setNote("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(`记录失败：${e.message}`),
  });
  const [date, setDate] = React.useState(todayStr());
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");

  const submit = () => {
    const t = title.trim();
    if (!t) {
      toast.error("请填写跟进事项");
      return;
    }
    if (!DAY_RE.test(date)) {
      toast.error("日期格式应为 YYYY-MM-DD");
      return;
    }
    create.mutate({
      entityType,
      entityId,
      title: t,
      followDate: date,
      note: note.trim() ? note.trim() : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>记一笔跟进</DialogTitle>
          <DialogDescription>
            {FOLLOWUP_ENTITY_META[entityType].zh} · {entityName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs opacity-60">日期</span>
            <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" className="h-8 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs opacity-60">事项</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：进入合同 / 电话沟通报价 / 收到样品"
              className="h-8 text-xs"
              maxLength={200}
            />
          </div>
          <div className="flex items-start gap-2">
            <span className="w-14 shrink-0 pt-1.5 text-xs opacity-60">备注</span>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="可选：细节、结论、下次动作"
              rows={3}
              className="min-h-[64px] text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
            <Button size="sm" onClick={submit} disabled={create.isPending}>保存</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* 行抽屉里的跟进区                                                    */
/* ------------------------------------------------------------------ */

export function FollowupSection({
  entityType, entityId, entityName, isAdmin,
}: {
  entityType: FollowupEntityType;
  entityId: number;
  entityName: string;
  isAdmin: boolean;
}) {
  const utils = trpc.useUtils();
  const { data } = trpc.crm.followup.list.useQuery();
  const del = trpc.crm.followup.delete.useMutation({
    onSuccess: () => void utils.crm.followup.list.invalidate(),
  });
  const [open, setOpen] = React.useState(false);
  const list = React.useMemo(
    () => (data ?? []).filter((r) => r.entityType === entityType && r.entityId === entityId),
    [data, entityType, entityId],
  );

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium opacity-60">跟进记录 (Follow-ups)</div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
            ＋ 记跟进
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <div className="text-xs opacity-40">暂无跟进记录</div>
      ) : (
        <ul className="space-y-1.5">
          {list.map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 font-dot opacity-60">{f.followDate}</span>
              <span className="min-w-0 flex-1 break-words">
                {f.title}
                {f.note ? <span className="opacity-50"> · {f.note}</span> : null}
              </span>
              {isAdmin && (
                <button
                  type="button"
                  className="shrink-0 opacity-40 hover:opacity-100"
                  title="删除这条跟进"
                  onClick={() => del.mutate({ id: f.id })}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FollowupDialog
        open={open}
        onOpenChange={setOpen}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 模块跟进页                                                          */
/* ------------------------------------------------------------------ */

export function FollowupsPage({
  types, isAdmin,
}: {
  types: FollowupEntityType[];
  isAdmin: boolean;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.crm.followup.list.useQuery();
  const names = useFollowupNames(types);
  const del = trpc.crm.followup.delete.useMutation({
    onSuccess: () => void utils.crm.followup.list.invalidate(),
  });
  const update = trpc.crm.followup.update.useMutation({
    onSuccess: () => void utils.crm.followup.list.invalidate(),
  });
  const create = trpc.crm.followup.create.useMutation({
    onSuccess: () => {
      void utils.crm.followup.list.invalidate();
      toast.success("跟进已记录");
      setNTitle("");
      setNName("");
    },
    onError: (e) => toast.error(`记录失败：${e.message}`),
  });

  /* 快速记一笔 */
  const [nType, setNType] = React.useState<FollowupEntityType>(types[0]);
  const [nName, setNName] = React.useState("");
  const [nDate, setNDate] = React.useState(todayStr());
  const [nTitle, setNTitle] = React.useState("");
  const candidates = useEntityCandidates(nType);

  const submitNew = () => {
    const want = nName.trim().toLowerCase();
    const hit = candidates.find((c) => c.name.toLowerCase() === want)
      ?? candidates.find((c) => c.name.toLowerCase().includes(want));
    if (!want || !hit) {
      toast.error("请从下拉候选里选一个对象（输入名字会出现候选）");
      return;
    }
    if (!nTitle.trim()) {
      toast.error("请填写跟进事项");
      return;
    }
    if (!DAY_RE.test(nDate)) {
      toast.error("日期格式应为 YYYY-MM-DD");
      return;
    }
    create.mutate({
      entityType: nType,
      entityId: hit.id,
      title: nTitle.trim(),
      followDate: nDate,
      note: null,
    });
  };

  const rows = React.useMemo(
    () => (data ?? []).filter((r) => (types as readonly string[]).includes(r.entityType)),
    [data, types],
  );

  const columns: Column<FollowupRow>[] = [
    {
      key: "followDate", zh: "日期", en: "Date", type: "date", width: 110,
      value: (r) => r.followDate,
    },
    {
      key: "entityType", zh: "类型", en: "Type", type: "enum", width: 90,
      options: ENTITY_OPTIONS, filterable: true,
      value: (r) => r.entityType,
      render: (r) => (
        <Badge variant="outline" className="font-normal">
          {FOLLOWUP_ENTITY_META[r.entityType as FollowupEntityType]?.zh ?? r.entityType}
        </Badge>
      ),
    },
    {
      key: "entityName", zh: "对象", en: "Entity", type: "text", width: 220,
      searchable: true,
      value: (r) => names.get(`${r.entityType}:${r.entityId}`) ?? `#${r.entityId}`,
    },
    {
      key: "title", zh: "跟进事项", en: "What", type: "text", width: 260,
      searchable: true, editable: true,
      value: (r) => r.title,
    },
    {
      key: "note", zh: "备注", en: "Note", type: "longtext", width: 320,
      editable: true, searchable: true,
      value: (r) => r.note,
    },
    {
      key: "ops", zh: "", en: "", type: "text", width: 60, noSort: true,
      value: () => "",
      render: (r) =>
        isAdmin ? (
          <button
            type="button"
            className="opacity-40 hover:opacity-100"
            title="删除这条跟进"
            onClick={(e) => {
              e.stopPropagation();
              del.mutate({ id: r.id });
            }}
          >
            ×
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2">
          <span className="text-xs opacity-60">快速记一笔：</span>
          <Select value={nType} onValueChange={(v) => setNType(v as FollowupEntityType)}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {FOLLOWUP_ENTITY_META[t].zh}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            list="fu-entity-candidates"
            value={nName}
            onChange={(e) => setNName(e.target.value)}
            placeholder="对象名字（输入出候选）…"
            className="h-8 w-52 text-xs"
          />
          <datalist id="fu-entity-candidates">
            {candidates.slice(0, 300).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <Input
            value={nDate}
            onChange={(e) => setNDate(e.target.value)}
            placeholder="YYYY-MM-DD"
            className="h-8 w-32 text-xs"
          />
          <Input
            value={nTitle}
            onChange={(e) => setNTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
            placeholder="跟进事项，如：进入合同 / 电话沟通…"
            className="h-8 min-w-52 flex-1 text-xs"
            maxLength={200}
          />
          <Button size="sm" className="h-8" onClick={submitNew} disabled={create.isPending}>
            保存
          </Button>
        </div>
      )}
      <DataTable<FollowupRow>
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(r) => r.id}
        storageKey={`followups-${types.join("-")}`}
        exportName="跟进"
        emptyTitle="还没有跟进记录"
        emptyHint="在任意表行抽屉点「＋ 记跟进」，或用上面的快速记一笔"
        onRefresh={() => void refetch()}
        onCellEdit={
          isAdmin
            ? async (row, key, value) => {
                if (key === "title") {
                  const t = String(value ?? "").trim();
                  if (!t) return;
                  await update.mutateAsync({ id: row.id, patch: { title: t } });
                } else if (key === "note") {
                  await update.mutateAsync({ id: row.id, patch: { note: value === null ? null : String(value) } });
                }
              }
            : undefined
        }
        initialSort={{ key: "followDate", dir: "desc" }}
      />
    </div>
  );
}
