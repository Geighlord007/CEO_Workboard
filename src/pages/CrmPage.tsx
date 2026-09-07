import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { ReportPage } from "@/components/crm/ReportPage";
import { CustomersPage } from "@/components/crm/CustomersPage";
import { PipelinePage } from "@/components/crm/PipelinePage";
import { QueuePage } from "@/components/crm/QueuePage";
import { SamplesPage } from "@/components/crm/SamplesPage";
import { SuppliersPage } from "@/components/crm/SuppliersPage";
import { RelationshipsPage } from "@/components/crm/RelationshipsPage";
import { CrmAiBar } from "@/components/crm/CrmAiBar";
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

type TabKey = "relationships" | "report" | "customers" | "pipeline" | "queue" | "samples" | "suppliers";

const TABS: { key: TabKey; label: string }[] = [
  { key: "relationships", label: "关系" },
  { key: "report", label: "报表" },
  { key: "customers", label: "客户" },
  { key: "pipeline", label: "商机" },
  { key: "queue", label: "跟进" },
  { key: "samples", label: "样品" },
  { key: "suppliers", label: "供应商" },
];

export default function CrmPage() {
  const { user, isLoading, logout } = useAuth({ redirectOnUnauthenticated: true });
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState<TabKey>("relationships");

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

  return (
    <div style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
      <div style={{ maxWidth: 1560, margin: "0 auto", padding: "12px 16px 8px" }}>
        {/* 顶栏 */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "2px 2px 12px",
            flexWrap: "wrap",
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
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
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

        {/* 主导航 Tab */}
        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className="nbtn"
              onClick={() => setTab(t.key)}
              style={
                tab === t.key
                  ? {
                      color: "var(--n-text)",
                      borderColor: "#818cf8",
                      boxShadow: "0 0 14px -6px rgba(129,140,248,0.9)",
                    }
                  : undefined
              }
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* 页面内容（Tab 切换带入场动效） */}
        <main style={{ minHeight: "calc(100dvh - 160px)" }}>
          <div key={tab} className="nx-tab-in">
            {tab === "relationships" && <RelationshipsPage isAdmin={isAdmin} />}
            {tab === "report" && <ReportPage />}
            {tab === "customers" && <CustomersPage isAdmin={isAdmin} />}
            {tab === "pipeline" && <PipelinePage isAdmin={isAdmin} />}
            {tab === "queue" && <QueuePage isAdmin={isAdmin} />}
            {tab === "samples" && <SamplesPage isAdmin={isAdmin} />}
            {tab === "suppliers" && <SuppliersPage isAdmin={isAdmin} />}
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
