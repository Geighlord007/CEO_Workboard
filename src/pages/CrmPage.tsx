import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { ReportPage } from "@/components/crm/ReportPage";
import { SamplesPage } from "@/components/crm/SamplesPage";
import { CrmAiBar } from "@/components/crm/CrmAiBar";
import { FollowupsPage } from "@/components/modules/FollowupsPage";
import { CustomersTable } from "@/components/modules/CustomersTable";
import { OpportunitiesTable } from "@/components/modules/OpportunitiesTable";
import { SuppliersTable } from "@/components/modules/SuppliersTable";
import { InvestorsTable } from "@/components/modules/InvestorsTable";
import { PeopleTable } from "@/components/modules/PeopleTable";
import { CompaniesTable } from "@/components/modules/CompaniesTable";
import { FundingEventsTable } from "@/components/modules/FundingEventsTable";
import { MobileDock } from "@/components/dash/MobileDock";
import { InstallPwa } from "@/components/InstallPwa";

/** 3×3 点阵 LOGO */
function DotLogo({ size = 18 }: { size?: number }) {
  const on = [0, 1, 2, 4, 5, 6, 7, 8];
  return (
    <svg width={size} height={size} viewBox="0 0 3 3" aria-hidden>
      {Array.from({ length: 9 }).map((_, i) => (
        <rect
          key={i}
          x={i % 3}
          y={Math.floor(i / 3)}
          width={0.72}
          height={0.72}
          rx={0.12}
          fill={on.includes(i) ? (i === 8 ? "var(--n-accent)" : "var(--n-text)") : "var(--n-lv1)"}
        />
      ))}
    </svg>
  );
}

type ModuleKey = "business" | "procurement" | "funding" | "people" | "intel" | "report";
type SubKey =
  | "customersTable" | "oppsTable" | "followupsBiz" | "samples"
  | "suppliersTable" | "followupsSup"
  | "investorsTable" | "followupsInv"
  | "peopleTable"
  | "companies" | "fundingEvents"
  | "report";

interface Sub { key: SubKey; label: string; el: (isAdmin: boolean) => React.ReactNode }
interface Module { key: ModuleKey; label: string; en: string; subs: Sub[] }

const MODULES: Module[] = [
  {
    key: "business", label: "业务", en: "Business",
    subs: [
      { key: "customersTable", label: "客户/合作方", el: (a) => <CustomersTable isAdmin={a} /> },
      { key: "oppsTable", label: "商机", el: (a) => <OpportunitiesTable isAdmin={a} /> },
      { key: "followupsBiz", label: "跟进", el: (a) => <FollowupsPage types={["account"]} isAdmin={a} /> },
      { key: "samples", label: "样品", el: (a) => <SamplesPage isAdmin={a} /> },
    ],
  },
  {
    key: "procurement", label: "采购", en: "Procurement",
    subs: [
      { key: "suppliersTable", label: "供应商", el: (a) => <SuppliersTable isAdmin={a} /> },
      { key: "followupsSup", label: "跟进", el: (a) => <FollowupsPage types={["supplier"]} isAdmin={a} /> },
    ],
  },
  {
    key: "funding", label: "融资", en: "Funding",
    subs: [
      { key: "investorsTable", label: "投资人/基金", el: (a) => <InvestorsTable isAdmin={a} /> },
      { key: "followupsInv", label: "跟进", el: (a) => <FollowupsPage types={["investor"]} isAdmin={a} /> },
    ],
  },
  {
    key: "people", label: "人脉", en: "Network",
    subs: [{ key: "peopleTable", label: "人脉簿", el: (a) => <PeopleTable isAdmin={a} /> }],
  },
  {
    key: "intel", label: "情报", en: "Intelligence",
    subs: [
      { key: "companies", label: "公司档案", el: (a) => <CompaniesTable isAdmin={a} /> },
      { key: "fundingEvents", label: "融资事件", el: (a) => <FundingEventsTable isAdmin={a} /> },
    ],
  },
  {
    key: "report", label: "报表", en: "Reports",
    subs: [{ key: "report", label: "周报/看板", el: () => <ReportPage /> }],
  },
];

export default function CrmPage() {
  const { user, isLoading, logout } = useAuth({ redirectOnUnauthenticated: true });
  const [theme, toggleTheme] = useTheme();
  const [mod, setMod] = useState<ModuleKey>("business");
  const [sub, setSub] = useState<SubKey>("customersTable");

  if (isLoading) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <DotLogo size={30} />
          <div className="nlabel" style={{ marginTop: 12 }}>
            LOADING<span className="n-blink">●</span>
          </div>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const isAdmin = user.role === "admin";
  const activeModule = MODULES.find((m) => m.key === mod) ?? MODULES[0];
  const activeSub = activeModule.subs.find((s) => s.key === sub) ?? activeModule.subs[0];

  const pickModule = (m: Module) => {
    setMod(m.key);
    setSub(m.subs[0].key);
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
      <div style={{ maxWidth: 1560, margin: "0 auto", padding: "12px 16px 8px" }}>
        {/* 顶栏 */}
        <header
          style={{
            display: "flex", alignItems: "center", gap: 12, padding: "2px 2px 12px", flexWrap: "wrap",
          }}
        >
          <span className="nx-logo"><DotLogo /></span>
          <Link to="/" className="nbtn" style={{ textDecoration: "none" }}>
            ← 返回看板
          </Link>
          <span className="font-dot nx-brand" style={{ fontSize: 17, letterSpacing: "0.06em" }}>
            WTC·CRM
          </span>
          <span
            className="nlabel"
            style={{
              color: isAdmin ? "var(--n-accent)" : "var(--n-dim)",
              border: "1px solid var(--n-border)",
              borderRadius: 999,
              padding: "2px 10px",
            }}
          >
            {isAdmin ? "总助 · 可写" : "CEO · 只读"}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              className="nbtn"
              onClick={toggleTheme}
              title="切换主题（T）"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <i
                style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: theme === "dark" ? "var(--n-text)" : "var(--n-accent)",
                  display: "inline-block",
                }}
              />
              {theme === "dark" ? "DARK" : "LIGHT"}
            </button>
            <span className="nlabel" style={{ color: "var(--n-faint)" }}>
              {user.name ?? "用户"}
            </span>
            <button className="nbtn" onClick={logout}>
              退出
            </button>
          </span>
        </header>

        {/* AI 快捷栏 */}
        {isAdmin && <CrmAiBar />}

        {/* 一级模块：业务 / 采购 / 融资 / 人脉 / 情报 / 报表 */}
        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {MODULES.map((m) => (
            <button
              key={m.key}
              className="nbtn"
              onClick={() => pickModule(m)}
              title={m.en}
              style={
                mod === m.key
                  ? { color: "var(--n-text)", borderColor: "#818cf8", boxShadow: "0 0 14px -6px rgba(129,140,248,0.9)" }
                  : undefined
              }
            >
              {m.label}
              <span style={{ opacity: 0.45, fontSize: 10, marginLeft: 6 }}>{m.en}</span>
            </button>
          ))}
        </nav>

        {/* 二级子页 */}
        {activeModule.subs.length > 1 && (
          <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, opacity: 0.95 }}>
            {activeModule.subs.map((s) => (
              <button
                key={s.key}
                className="nbtn"
                onClick={() => setSub(s.key)}
                style={
                  sub === s.key
                    ? { color: "var(--n-accent)", borderColor: "var(--n-accent)" }
                    : { opacity: 0.7 }
                }
              >
                {s.label}
              </button>
            ))}
          </nav>
        )}

        {/* 页面内容（切换带入场动效） */}
        <main style={{ minHeight: "calc(100dvh - 160px)" }}>
          <div key={`${mod}-${sub}`} className="nx-tab-in">
            {activeSub.el(isAdmin)}
          </div>
        </main>
      </div>

      {/* 手机端：底部 Dock 占位 + Dock + 安装引导 */}
      <div className="nx-dock-gap" aria-hidden />
      <MobileDock />
      <InstallPwa />
    </div>
  );
}
