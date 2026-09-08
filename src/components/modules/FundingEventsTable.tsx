/**
 * 融资事件表（情报库 · 只读）
 * 数据：crm.intel.funding（全部融资事件，页面侧筛选）
 * 情报库是公开快照的只读参考数据，页面内不提供编辑（无 onCellEdit）。
 */
import * as React from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Info } from "lucide-react";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { DataTable, type Column } from "@/components/table/DataTable";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type FundingRow = RouterOutputs["crm"]["intel"]["funding"][number];

const nf = new Intl.NumberFormat("zh-CN");

/** 空值统一显示 — */
function dash(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** 美元金额（千分位）；空值返回空串 */
function usd(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return String(v);
  return `$${nf.format(Math.round(n))}`;
}

export function FundingEventsTable({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, refetch } = trpc.crm.intel.funding.useQuery();
  const [open, setOpen] = React.useState<FundingRow | null>(null);

  const columns: Column<FundingRow>[] = [
    {
      key: "companyName", zh: "公司", en: "Company", type: "text", width: 220,
      value: (r) => r.companyName,
    },
    {
      key: "roundType", zh: "轮次类型", en: "Round", type: "text", width: 130,
      filterable: true, value: (r) => r.roundType,
    },
    {
      key: "announcedDate", zh: "公布日期", en: "Announced", type: "date", width: 120,
      value: (r) => r.announcedDate,
    },
    {
      key: "amountUsd", zh: "金额USD", en: "Amount (USD)", type: "money", width: 150,
      align: "right", value: (r) => r.amountUsd,
    },
    {
      key: "amountOriginal", zh: "原文金额", en: "Original amount", type: "text", width: 130,
      value: (r) => r.amountOriginal,
    },
    {
      key: "valuation", zh: "估值", en: "Valuation", type: "text", width: 140,
      value: (r) => r.valuation,
    },
    {
      key: "leadInvestors", zh: "领投方", en: "Lead investors", type: "longtext", width: 240,
      value: (r) => r.leadInvestors,
    },
    {
      key: "pharmaOrNon", zh: "领域", en: "Pharma / Non-pharma", type: "text", width: 110,
      filterable: true, value: (r) => r.pharmaOrNon,
    },
    {
      key: "sliceTags", zh: "切片", en: "Slices", type: "tags", width: 200,
      value: (r) => r.sliceTags,
    },
    {
      key: "source", zh: "来源", en: "Source", type: "text", width: 100,
      hiddenByDefault: true, value: (r) => r.source,
    },
  ];

  return (
    <>
      <div className="mb-3 flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs opacity-70">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          融资事件为情报库只读参考数据（公开快照）
          {isAdmin ? "，每周由 Agent 按公司链接 upsert，如需修正请走数据导入流程。" : "，不支持页面内编辑。"}
          {" "}搜索框覆盖公司名与领投方。
        </span>
      </div>

      <DataTable<FundingRow>
        columns={columns}
        rows={data}
        loading={isLoading}
        rowKey={(r) => r.id}
        storageKey="fundingEvents"
        exportName="融资事件"
        emptyTitle="融资事件库暂无数据"
        emptyHint="等待情报 Agent 按 Crunchbase 快照导入"
        onRowClick={(r) => setOpen(r)}
        onRefresh={() => void refetch()}
        initialSort={{ key: "announcedDate", dir: "desc" }}
      />

      <Drawer open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>{open?.companyName}</DrawerTitle>
            <DrawerDescription>
              {open && (
                <>
                  {dash(open.roundType)} · {dash(open.announcedDate)} ·{" "}
                  {usd(open.amountUsd) || open.amountOriginal || "金额未披露"}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>
          {open && <FundingDetail row={open} />}
        </DrawerContent>
      </Drawer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 简易详情抽屉                                                        */
/* ------------------------------------------------------------------ */

function FundingDetail({ row }: { row: FundingRow }) {
  return (
    <div className="space-y-4 overflow-auto px-4 pb-6 text-sm">
      <section className="space-y-2">
        <Field label="公司">{dash(row.companyName)}</Field>
        <Field label="轮次">
          <Badge variant="outline">{dash(row.roundType)}</Badge>
        </Field>
        <Field label="公布日期">{dash(row.announcedDate)}</Field>
        <Field label="金额USD">
          <span className="tabular-nums">{usd(row.amountUsd) || "—"}</span>
        </Field>
        <Field label="原文金额">{dash(row.amountOriginal)}</Field>
        <Field label="估值">{dash(row.valuation)}</Field>
        <Field label="领投方">{dash(row.leadInvestors)}</Field>
        <Field label="参与方">{dash(row.participants)}</Field>
        <Field label="切片">{dash(row.sliceTags)}</Field>
        <Field label="领域">{dash(row.pharmaOrNon)}</Field>
        <Field label="来源">{dash(row.source)}</Field>
      </section>
      {row.companyCbUrl && (
        <section>
          <div className="mb-1 text-xs font-medium opacity-60">公司链接</div>
          <a
            href={/^https?:\/\//i.test(row.companyCbUrl) ? row.companyCbUrl : `https://${row.companyCbUrl}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 opacity-90 hover:opacity-100"
          >
            Crunchbase
          </a>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-20 shrink-0 text-xs opacity-50">{label}</div>
      <div className="min-w-0 flex-1 break-words" title={typeof children === "string" ? children : undefined}>
        {children}
      </div>
    </div>
  );
}
