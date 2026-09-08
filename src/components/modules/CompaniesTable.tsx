/**
 * 公司档案（情报库 · 只读）
 * 数据：crm.intel.companies（公司库列表）
 *       crm.intel.company / crm.intel.companyFunding（行点击 → 详情抽屉 + 融资时间线；
 *       列表接口不带 description，简介列按行复用 company 详情查询）
 * 情报库是 Crunchbase 等公开快照的只读参考数据，页面内不提供编辑（无 onCellEdit）。
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
type CompanyRow = RouterOutputs["crm"]["intel"]["companies"][number];
type CompanyDetail = RouterOutputs["crm"]["intel"]["company"];
type FundingRound = RouterOutputs["crm"]["intel"]["companyFunding"][number];

/* ------------------------------------------------------------------ */
/* 格式化工具                                                          */
/* ------------------------------------------------------------------ */

const nf = new Intl.NumberFormat("zh-CN");

/** 空值统一显示 — */
function dash(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** 美元金额（千分位）；空值返回空串，便于与「原文金额」拼装 */
function usd(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return String(v);
  return `$${nf.format(Math.round(n))}`;
}

/** 酶企标签筛选选项（enzyme / 空） */
const ENZYME_OPTIONS = [
  { value: "enzyme", zh: "酶企", en: "Enzyme" },
  { value: "", zh: "未标注", en: "Untagged" },
];

/* ------------------------------------------------------------------ */
/* 主表                                                                */
/* ------------------------------------------------------------------ */

export function CompaniesTable({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, refetch } = trpc.crm.intel.companies.useQuery();
  const [open, setOpen] = React.useState<CompanyRow | null>(null);

  const columns: Column<CompanyRow>[] = [
    {
      key: "name", zh: "公司名", en: "Company", type: "text", width: 240,
      value: (r) => r.name,
    },
    {
      key: "hq", zh: "国家", en: "HQ", type: "text", width: 150,
      filterable: true, value: (r) => r.hq,
    },
    {
      key: "sliceTags", zh: "赛道", en: "Slices", type: "tags", width: 220,
      filterable: true, value: (r) => r.sliceTags,
    },
    {
      key: "industries", zh: "行业", en: "Industries", type: "tags", width: 200,
      value: (r) => r.industries,
    },
    {
      key: "foundedYear", zh: "成立年", en: "Founded", type: "text", width: 90,
      value: (r) => r.foundedYear,
    },
    {
      key: "lastFundingType", zh: "最近轮次/最近融资日", en: "Last round / date", type: "text", width: 180,
      filterable: true,
      value: (r) => [r.lastFundingType, r.lastFundingDate].filter(Boolean).join(" · "),
      render: (r) => {
        if (!r.lastFundingType && !r.lastFundingDate) return <span className="opacity-30">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {r.lastFundingType && <Badge variant="outline">{r.lastFundingType}</Badge>}
            {r.lastFundingDate && <span className="tabular-nums opacity-70">{r.lastFundingDate}</span>}
          </span>
        );
      },
    },
    {
      key: "roundCount", zh: "轮次明细", en: "Rounds (detail)", type: "number", width: 100,
      align: "right", value: (r) => r.roundCount,
      render: (r) => {
        const n = r.roundCount ?? 0;
        return n > 0 ? (
          <span className="tabular-nums" title={`Crunchbase 事件库中的 ${n} 条融资明细（点开查看时间线）`}>
            {n}
          </span>
        ) : (
          <span className="opacity-40" title="该公司的融资明细未收录（事件库仅覆盖 gene-edit / dairy / 非药 等切片）；累计融资额来自公司库快照">
            —
          </span>
        );
      },
    },
    {
      key: "ipoStatus", zh: "上市/被收购", en: "IPO / acquired", type: "text", width: 180,
      filterable: true,
      value: (r) => [r.ipoStatus, r.acquiredBy].filter(Boolean).join(" · "),
      render: (r) => {
        if (!r.ipoStatus && !r.acquiredBy) return <span className="opacity-30">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {r.ipoStatus && <Badge variant="secondary">{r.ipoStatus}</Badge>}
            {r.acquiredBy && <span className="opacity-80">被收购：{r.acquiredBy}</span>}
          </span>
        );
      },
    },
    {
      key: "totalFundingUsd", zh: "累计融资 (USD)", en: "Total funding (USD)", type: "money", width: 150,
      align: "right", value: (r) => r.totalFundingUsd,
    },
    {
      key: "cbUrl", zh: "官网/CB链接", en: "Website / Crunchbase", type: "link", width: 200,
      value: (r) => r.cbUrl ?? r.domain,
      render: (r) => {
        if (!r.domain && !r.cbUrl) return <span className="opacity-30">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {r.domain && <ExtLink href={r.domain} />}
            {r.cbUrl && <ExtLink href={r.cbUrl} label="Crunchbase" />}
          </span>
        );
      },
    },
    {
      key: "description", zh: "简介/备注", en: "Description", type: "longtext", width: 300,
      noSort: true, searchable: false,
      value: (r) => r.descriptionBrief,
      exportValue: (r) => r.descriptionBrief,
      render: (r) => {
        const text = (r.descriptionBrief ?? "").trim();
        if (!text) return <span className="opacity-30">—</span>;
        return (
          <span className="line-clamp-2 max-w-[300px] whitespace-pre-wrap" title={text}>
            {text}
          </span>
        );
      },
    },
    {
      key: "enzymeTag", zh: "酶企标签", en: "Enzyme tag", type: "enum", width: 100,
      options: ENZYME_OPTIONS, filterable: true, hiddenByDefault: true,
      value: (r) => r.enzymeTag,
    },
  ];

  return (
    <>
      <div className="mb-3 flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs opacity-70">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          公司档案为情报库只读参考数据（公开快照）
          {isAdmin ? "，每周由 Agent 按 CB 链接 upsert，如需修正请走数据导入流程。" : "，不支持页面内编辑。"}
        </span>
      </div>

      <DataTable<CompanyRow>
        columns={columns}
        rows={data}
        loading={isLoading}
        rowKey={(r) => r.id}
        storageKey="companies"
        exportName="公司档案"
        emptyTitle="公司库暂无数据"
        emptyHint="等待情报 Agent 按 Crunchbase 快照导入"
        onRowClick={(r) => setOpen(r)}
        onRefresh={() => void refetch()}
        initialSort={{ key: "name", dir: "asc" }}
      />

      <Drawer open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>{open?.name}</DrawerTitle>
            <DrawerDescription>
              {open && (
                <>
                  {dash(open.hq)} · {dash(open.industries)} · {dash(open.sliceTags)}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>
          {open && <CompanyDetailBody row={open} />}
        </DrawerContent>
      </Drawer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 详情抽屉                                                            */
/* ------------------------------------------------------------------ */

function CompanyDetailBody({ row }: { row: CompanyRow }) {
  const { data: detail, isLoading: detailLoading } = trpc.crm.intel.company.useQuery({ id: row.id });
  const { data: rounds, isLoading: roundsLoading } = trpc.crm.intel.companyFunding.useQuery({
    companyId: row.id,
  });

  /** 列表行先渲染概要，详情返回后补全官网/简介等列表未带出的字段 */
  const c: CompanyRow | CompanyDetail = detail ?? row;
  const timeline: FundingRound[] = rounds ?? [];

  return (
    <div className="space-y-5 overflow-auto px-4 pb-6 text-sm">
      {/* 概要 */}
      <section>
        <div className="mb-2 text-xs font-medium opacity-60">公司概要</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Fact label="国家">{dash(c.hq)}</Fact>
          <Fact label="成立年">{dash(c.foundedYear)}</Fact>
          <Fact label="累计融资">{usd(c.totalFundingUsd) || "—"}</Fact>
          <Fact label="融资明细">{c.roundCount === null || c.roundCount === undefined ? "—" : `${c.roundCount} 条`}</Fact>
          <Fact label="最近轮次">{dash(c.lastFundingType)}</Fact>
          <Fact label="最近融资日">{dash(c.lastFundingDate)}</Fact>
          <Fact label="上市状态">{dash(c.ipoStatus)}</Fact>
          <Fact label="被收购">
            {c.acquiredBy
              ? `${c.acquiredBy}${c.acquiredDate ? ` · ${c.acquiredDate}` : ""}`
              : "—"}
          </Fact>
          <Fact label="行业">{dash(c.industries)}</Fact>
          <Fact label="赛道">{dash(c.sliceTags)}</Fact>
          <Fact label="酶企标签">{dash(c.enzymeTag)}</Fact>
          <Fact label="官网">
            {detail?.domain ? <ExtLink href={detail.domain} /> : detailLoading ? "加载中…" : "—"}
          </Fact>
          <Fact label="CB链接">
            {c.cbUrl ? <ExtLink href={c.cbUrl} label="Crunchbase" /> : "—"}
          </Fact>
          <Fact label="数据来源">
            {dash(c.source)}
            {c.snapshotDate ? <span className="opacity-50"> · {c.snapshotDate}</span> : null}
          </Fact>
        </div>
      </section>

      {/* 简介全文 */}
      <section>
        <div className="mb-1 text-xs font-medium opacity-60">公司简介</div>
        {detailLoading ? (
          <div className="space-y-1.5">
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="whitespace-pre-wrap opacity-80">{detail?.description?.trim() || "—"}</div>
        )}
      </section>

      {/* 融资时间线 */}
      <section>
        <div className="mb-2 text-xs font-medium opacity-60">
          融资时间线{!roundsLoading && timeline.length > 0 ? `（${timeline.length} 轮）` : ""}
        </div>
        {roundsLoading ? (
          <div className="opacity-50">加载中…</div>
        ) : timeline.length === 0 ? (
          <div className="opacity-50">暂无融资记录</div>
        ) : (
          <ol className="relative space-y-3 border-l pl-4">
            {timeline.map((f) => (
              <FundingRoundItem key={f.id} round={f} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function FundingRoundItem({ round }: { round: FundingRound }) {
  const amount = usd(round.amountUsd);
  return (
    <li className="relative">
      <span
        aria-hidden
        className="absolute -left-[20px] top-1.5 h-2 w-2 rounded-full bg-primary"
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tabular-nums text-xs opacity-70">{dash(round.announcedDate)}</span>
        <Badge variant="outline">{dash(round.roundType)}</Badge>
        <span className="font-medium tabular-nums">
          {amount || round.amountOriginal || "—"}
        </span>
        {amount && round.amountOriginal && (
          <span className="text-xs opacity-60">原文 {round.amountOriginal}</span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs opacity-70">
        <span>估值 {dash(round.valuation)}</span>
        <span>领投方 {dash(round.leadInvestors)}</span>
        {round.participants && <span>参与方 {round.participants}</span>}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* 小部件                                                              */
/* ------------------------------------------------------------------ */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] opacity-50">{label}</div>
      <div className="truncate" title={typeof children === "string" ? children : undefined}>
        {children}
      </div>
    </div>
  );
}

function ExtLink({ href, label }: { href: string; label?: string }) {
  const url = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 opacity-90 hover:opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      {label ?? href.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
    </a>
  );
}
