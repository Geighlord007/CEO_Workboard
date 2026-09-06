import { useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useTheme } from "@/hooks/useTheme";
import { diffDays, pad2, todayStr } from "@/lib/dates";
import { PRIORITY_LABEL, RISK_LEVEL_LABEL, TRACK_KEYS, TRACK_META } from "@contracts/dash";

/**
 * 老板周报只读视图：/r/:token 公开访问（凭令牌），
 * 数据从任务/风险/节点表实时聚合，无需人工维护周报。
 */
export default function Report() {
  const { token = "" } = useParams();
  const [theme, toggleTheme] = useTheme();
  const { data, isLoading, error } = trpc.report.byToken.useQuery(
    { token },
    { retry: false, staleTime: 60_000 },
  );

  const wrap: React.CSSProperties = {
    maxWidth: 880,
    margin: "0 auto",
    padding: "28px 18px 40px",
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <span className="nlabel">LOADING<span className="n-blink">●</span></span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="font-dot" style={{ fontSize: 28 }}>404</div>
          <div className="nlabel" style={{ marginTop: 8 }}>周报链接无效或已过期</div>
        </div>
      </div>
    );
  }

  const today = todayStr();
  const doneList = data.weekTasks.filter((t) => t.done);
  const doingList = data.weekTasks.filter((t) => !t.done);
  const pct = data.weekTasks.length
    ? Math.round((doneList.length / data.weekTasks.length) * 100)
    : 0;
  const nextMs = data.milestones.find((m) => diffDays(today, m.targetDate) >= 0);

  const sectionHead = (text: string, count?: number) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderBottom: "1px solid var(--n-border)", paddingBottom: 6, margin: "26px 0 4px" }}>
      <span className="nlabel" style={{ fontSize: 11, color: "var(--n-text)" }}>
        <span className="nlabel-accent">● </span>{text}
      </span>
      {count != null && <span className="font-dot" style={{ color: "var(--n-dim)", fontSize: 12 }}>{count}</span>}
    </div>
  );

  return (
    <div style={wrap}>
      {/* 头部 */}
      <header style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="font-dot" style={{ fontSize: 20 }}>WTC · 每周战报</span>
        <span className="nlabel">{data.weekOf.slice(5).replace("-", ".")} — {data.nextWeekOf.slice(5).replace("-", ".")} 周</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span className="nlabel" style={{ color: "var(--n-faint)" }}>只读 · 实时生成</span>
          <button className="nbtn" onClick={toggleTheme}>{theme === "dark" ? "DARK" : "LIGHT"}</button>
        </span>
      </header>

      {/* KPI 条 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginTop: 18 }}>
        <div className="ncard" style={{ padding: "14px 16px" }}>
          <div className="font-dot" style={{ fontSize: 34, lineHeight: 1 }}>{pct}<span style={{ fontSize: "0.4em", color: "var(--n-dim)" }}>%</span></div>
          <div className="nlabel" style={{ marginTop: 6 }}>本周完成率</div>
        </div>
        <div className="ncard" style={{ padding: "14px 16px" }}>
          <div className="font-dot" style={{ fontSize: 34, lineHeight: 1 }}>{doneList.length}</div>
          <div className="nlabel" style={{ marginTop: 6 }}>已完成</div>
        </div>
        <div className="ncard" style={{ padding: "14px 16px" }}>
          <div className="font-dot" style={{ fontSize: 34, lineHeight: 1 }}>{doingList.length}</div>
          <div className="nlabel" style={{ marginTop: 6 }}>进行中</div>
        </div>
        <div className="ncard" style={{ padding: "14px 16px" }}>
          <div className="font-dot" style={{ fontSize: 34, lineHeight: 1, color: data.risks.length ? "var(--n-accent)" : "var(--n-text)" }}>
            {data.risks.length}
          </div>
          <div className="nlabel" style={{ marginTop: 6 }}>风险阻塞</div>
        </div>
        {nextMs && (
          <div className="ncard" style={{ padding: "14px 16px" }}>
            <div className="font-dot" style={{ fontSize: 34, lineHeight: 1, color: diffDays(today, nextMs.targetDate) <= 3 ? "var(--n-accent)" : "var(--n-text)" }}>
              D-{diffDays(today, nextMs.targetDate)}
            </div>
            <div className="nlabel" style={{ marginTop: 6 }}>{nextMs.title}</div>
          </div>
        )}
      </div>

      {/* 进行中 */}
      {sectionHead("进行中 · 本周", doingList.length)}
      {TRACK_KEYS.map((tk) => {
        const list = doingList.filter((t) => t.track === tk);
        if (!list.length) return null;
        return (
          <div key={tk}>
            <div className="nlabel" style={{ padding: "8px 0 2px", color: "var(--n-faint)" }}>[{TRACK_META[tk].short}] {TRACK_META[tk].label}</div>
            {list.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px dashed var(--n-border-soft)", fontSize: 12, alignItems: "baseline" }}>
                <span style={{ flex: 1 }}>{t.title}</span>
                <span className="font-dot" style={{ fontSize: 9, color: t.priority === 0 ? "var(--n-accent)" : "var(--n-dim)" }}>{PRIORITY_LABEL[t.priority]}</span>
                {t.dueDate && <span className="nlabel" style={{ fontSize: 9 }}>截止 {t.dueDate.slice(5).replace("-", ".")}</span>}
              </div>
            ))}
          </div>
        );
      })}
      {!doingList.length && <div className="nlabel" style={{ padding: "10px 0" }}>— 本周任务已全部完成 —</div>}

      {/* 本周完成 */}
      {sectionHead("已完成 · 本周", doneList.length)}
      {TRACK_KEYS.map((tk) => {
        const list = doneList.filter((t) => t.track === tk);
        if (!list.length) return null;
        return (
          <div key={tk}>
            <div className="nlabel" style={{ padding: "8px 0 2px", color: "var(--n-faint)" }}>[{TRACK_META[tk].short}] {TRACK_META[tk].label}</div>
            {list.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px dashed var(--n-border-soft)", fontSize: 12, color: "var(--n-dim)" }}>
                <span style={{ color: "var(--n-accent)", flex: "none" }}>✓</span>
                <span style={{ flex: 1 }}>{t.title}</span>
                {t.completedDay && <span className="nlabel" style={{ fontSize: 9 }}>{t.completedDay.slice(5).replace("-", ".")}</span>}
              </div>
            ))}
          </div>
        );
      })}

      {/* 风险与阻塞 */}
      {sectionHead("风险与阻塞", data.risks.length)}
      {data.risks.length === 0 && <div className="nlabel" style={{ padding: "10px 0" }}>— 无阻塞 · 一路绿灯 —</div>}
      {data.risks.map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px dashed var(--n-border-soft)", fontSize: 12 }}>
          <i style={{ width: 8, height: 8, borderRadius: 2, marginTop: 4, flex: "none", background: r.level === "high" ? "var(--n-accent)" : r.level === "mid" ? "var(--n-text)" : "var(--n-faint)" }} />
          <div style={{ flex: 1 }}>
            {r.title}
            <span className="nlabel" style={{ marginLeft: 8, fontSize: 9 }}>[{RISK_LEVEL_LABEL[r.level]}]</span>
            {r.detail && <div style={{ fontSize: 11, color: "var(--n-dim)", marginTop: 2 }}>{r.detail}</div>}
            {r.needFrom && <div style={{ fontSize: 11, color: r.level === "high" ? "var(--n-accent)" : "var(--n-dim)", marginTop: 2 }}>→ 需 {r.needFrom} 支持</div>}
          </div>
        </div>
      ))}

      {/* 下周计划 */}
      {sectionHead("下周计划", data.nextTasks.length)}
      {data.nextTasks.map((t) => (
        <div key={t.id} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px dashed var(--n-border-soft)", fontSize: 12, alignItems: "baseline" }}>
          <span style={{ flex: 1 }}>{t.title}</span>
          <span className="nlabel" style={{ fontSize: 9 }}>[{TRACK_META[t.track].short}]</span>
          <span className="font-dot" style={{ fontSize: 9, color: t.priority === 0 ? "var(--n-accent)" : "var(--n-dim)" }}>{PRIORITY_LABEL[t.priority]}</span>
        </div>
      ))}
      {!data.nextTasks.length && <div className="nlabel" style={{ padding: "10px 0" }}>— 尚未排入 —</div>}

      {/* 关键节点 */}
      {sectionHead("关键节点", data.milestones.length)}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "8px 0" }}>
        {data.milestones.map((m) => {
          const d = diffDays(today, m.targetDate);
          return (
            <div key={m.id}>
              <span className="font-dot" style={{ fontSize: 20, color: d < 0 ? "var(--n-faint)" : d <= 3 ? "var(--n-accent)" : "var(--n-text)" }}>
                {d >= 0 ? `D-${d}` : `D+${-d}`}
              </span>
              <div className="nlabel" style={{ marginTop: 2 }}>{m.title} · {m.targetDate.slice(5).replace("-", ".")}</div>
            </div>
          );
        })}
      </div>

      <footer style={{ marginTop: 34, borderTop: "1px solid var(--n-border)", paddingTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span className="nlabel" style={{ color: "var(--n-faint)" }}>
          本页由每周任务控制台自动生成 · 数据截至 {pad2(data.generatedAt.getMonth() + 1)}.{pad2(data.generatedAt.getDate())} {pad2(data.generatedAt.getHours())}:{pad2(data.generatedAt.getMinutes())}
        </span>
      </footer>
    </div>
  );
}
