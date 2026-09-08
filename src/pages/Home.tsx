import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useStacked } from "@/hooks/useStacked";
import { trpc } from "@/providers/trpc";
import { TooltipProvider } from "@/components/dash/Tooltip";
import { Card } from "@/components/dash/Card";
import { CARD_ORDER, useLayout, type CardId } from "@/components/dash/layout";
import { ClockCard } from "@/components/dash/ClockCard";
import { CalendarCard } from "@/components/dash/CalendarCard";
import { ScheduleCard } from "@/components/dash/ScheduleCard";
import { NotesCard } from "@/components/dash/NotesCard";
import { TasksCard } from "@/components/dash/TasksCard";
import { BatteryCard } from "@/components/dash/BatteryCard";
import { TrendCard } from "@/components/dash/TrendCard";
import { OffworkCard } from "@/components/dash/OffworkCard";
import { HeatmapCard } from "@/components/dash/HeatmapCard";
import { AiAssistant } from "@/components/dash/AiAssistant";
import { RisksCard } from "@/components/dash/RisksCard";
import { PipelineCard } from "@/components/dash/PipelineCard";
import { LinksCard } from "@/components/dash/LinksCard";
import { MobileDock } from "@/components/dash/MobileDock";
import { InstallPwa } from "@/components/InstallPwa";
import { addDays, dayFmt, mondayOf, weekNo } from "@/lib/dates";

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

const fmtMD = (s: string) => `${s.slice(5, 7)}.${s.slice(8)}`;

export default function Home() {
  const { user, isLoading, logout } = useAuth({ redirectOnUnauthenticated: true });
  const [theme, toggleTheme] = useTheme();
  const stacked = useStacked();
  const { spanOf, setSpan, resetOne, resetAll, isCustom } = useLayout();
  const [copied, setCopied] = useState(false);

  const tokenQuery = trpc.report.getToken.useQuery(undefined, {
    enabled: !!user,
    staleTime: Infinity,
  });

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
  if (!user) return null; // 重定向到登录页中

  const mon = mondayOf(new Date());
  const sun = addDays(mon, 6);
  const weekRange = `${fmtMD(dayFmt(mon))} — ${fmtMD(dayFmt(sun))} · W${weekNo(new Date())}`;

  const copyReportLink = async () => {
    const token = tokenQuery.data;
    if (!token) return;
    const url = `${window.location.origin}/r/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("复制老板周报只读链接：", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderCard = (id: CardId, index: number) => {
    const span = spanOf(id);
    const compact = span.h <= 2;
    const inner: Record<CardId, React.ReactNode> = {
      clock: <ClockCard compact={compact} />,
      calendar: <CalendarCard compact={compact} />,
      schedule: <ScheduleCard compact={compact} />,
      notes: <NotesCard />,
      tasks: <TasksCard compact={compact} />,
      battery: <BatteryCard compact={span.w <= 2} />,
      trend: <TrendCard />,
      offwork: <OffworkCard />,
      heatmap: <HeatmapCard />,
      risks: <RisksCard compact={compact} />,
      pipeline: <PipelineCard relType="client" />,
      suppliers: <PipelineCard relType="supplier" />,
      links: <LinksCard compact={compact} />,
    };
    return (
      <Card key={id} id={id} index={index} span={span} stacked={stacked} onSpan={setSpan} onReset={resetOne}>
        {inner[id]}
      </Card>
    );
  };

  return (
    <TooltipProvider>
      <div style={{ maxWidth: 1560, margin: "0 auto", padding: "12px 16px 8px" }}>
        {/* ===== 顶栏 ===== */}
        <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 2px 12px", flexWrap: "wrap" }}>
          <span className="nx-logo"><DotLogo /></span>
          <span className="font-dot nx-brand" style={{ fontSize: 17, letterSpacing: "0.06em" }}>WTC</span>
          <span className="nlabel">每周任务控制台</span>
          <span className="nlabel" style={{ color: "var(--n-faint)" }}>{weekRange}</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {user.role === "admin" && (
              <Link to="/data" className="nbtn" style={{ textDecoration: "none" }} title="浏览/安全编辑业务表数据">
                数据
              </Link>
            )}
            <Link to="/crm" className="nbtn" style={{ textDecoration: "none" }} title="打开 CRM 关系管理">
              CRM
            </Link>
            <button className="nbtn nbtn-accent" onClick={copyReportLink} title="复制老板周报只读链接">
              {copied ? "✓ 已复制" : "⤴ 老板周报链接"}
            </button>
            {/* 主题胶囊开关（T 键同效） */}
            <button className="nbtn" onClick={toggleTheme} title="切换主题（T）" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: theme === "dark" ? "var(--n-text)" : "var(--n-accent)", display: "inline-block" }} />
              {theme === "dark" ? "DARK" : "LIGHT"}
            </button>
            <span className="nlabel" style={{ color: "var(--n-faint)" }}>{user.name ?? "用户"}</span>
            <button className="nbtn" onClick={logout}>退出</button>
          </span>
        </header>

        {/* ===== 十二列网格 ===== */}
        <main className={`dash-grid${stacked ? " stacked" : ""}`}>
          {CARD_ORDER.map((id, i) => renderCard(id, i))}
        </main>

        {/* ===== AI 指令助手（悬浮） ===== */}
        <AiAssistant />

        {/* ===== 页脚 ===== */}
        <footer style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 2px 10px", flexWrap: "wrap" }}>
          <button className="nbtn" onClick={resetAll} disabled={!isCustom} title="恢复全部卡片默认布局">
            ⟲ RESET LAYOUT
          </button>
          <span className="nlabel" style={{ color: "var(--n-faint)" }}>
            <span className="n-blink" style={{ color: "var(--n-accent)" }}>●</span> 数据云端同步 · 布局与主题保存在本机
          </span>
          <span className="nlabel" style={{ marginLeft: "auto", color: "var(--n-faint)" }}>
            T = 切换主题 · 拖把手缩放卡片 · 双击把手复原
          </span>
        </footer>

        {/* 手机端：底部 Dock 占位 + Dock + 安装引导 */}
        <div className="nx-dock-gap" aria-hidden />
        <MobileDock />
        <InstallPwa />
      </div>
    </TooltipProvider>
  );
}
