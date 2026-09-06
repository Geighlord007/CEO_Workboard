import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  dayFmt,
  diffDays,
  minToHHMM,
  pad2,
  parseDay,
  todayStr,
  WEEKDAYS_CN,
} from "@/lib/dates";
import { EVENT_KIND_LABEL } from "@contracts/dash";

const SEL_KEY = "wtc-seldate";

/** 月历：红点标记事项，今天红色高亮，点击日期显示事项与距目标日天数 */
export function CalendarCard({ compact }: { compact: boolean }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState<string>(() => {
    try {
      return localStorage.getItem(SEL_KEY) || todayStr();
    } catch {
      return todayStr();
    }
  });

  const { data: events } = trpc.event.list.useQuery();
  const { data: ms } = trpc.milestone.list.useQuery();
  const { data: datedTasks } = trpc.task.listDated.useQuery();

  const byDate = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const e of events ?? []) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const taskByDate = useMemo(() => {
    const map = new Map<string, typeof datedTasks>();
    for (const t of datedTasks ?? []) {
      if (!t.dueDate) continue;
      const arr = map.get(t.dueDate) ?? [];
      arr.push(t);
      map.set(t.dueDate, arr);
    }
    return map;
  }, [datedTasks]);

  const pick = (d: string) => {
    setSel(d);
    try {
      localStorage.setItem(SEL_KEY, d);
    } catch {
      /* ignore */
    }
  };

  const nav = (dir: number) =>
    setYm(({ y, m }) => {
      const nm = m + dir;
      return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });

  // 月历矩阵（周一开头）
  const first = new Date(ym.y, ym.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const dim = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = todayStr();
  const selEvents = byDate.get(sel) ?? [];
  const selTasks = taskByDate.get(sel) ?? [];
  const nextMilestone = (ms ?? []).find((m) => diffDays(sel, m.targetDate) >= 0);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="font-dot" style={{ fontSize: 14 }}>
          {ym.y}.{pad2(ym.m + 1)}
        </span>
        <span>
          <button className="nicon" onClick={() => nav(-1)} aria-label="上一月">◀</button>
          <button className="nicon" onClick={() => nav(1)} aria-label="下一月">▶</button>
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 2,
          marginTop: 6,
          flex: compact ? undefined : 1,
          alignContent: "start",
        }}
      >
        {WEEKDAYS_CN.map((w) => (
          <div key={w} className="nlabel" style={{ textAlign: "center", fontSize: 9, letterSpacing: "0.1em" }}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ds = dayFmt(new Date(ym.y, ym.m, d));
          const evs = byDate.get(ds);
          const ts = taskByDate.get(ds);
          const isToday = ds === today;
          const isSel = ds === sel;
          return (
            <button
              key={i}
              onClick={() => pick(ds)}
              style={{
                border: "none",
                background: isToday ? "var(--n-accent)" : isSel ? "var(--n-card2)" : "transparent",
                color: isToday ? "#fff" : "var(--n-text)",
                borderRadius: 4,
                padding: "2px 0 3px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                outline: isSel && !isToday ? "1px solid var(--n-dim)" : "none",
                font: "inherit",
                fontSize: 10,
                lineHeight: 1.2,
              }}
              aria-label={`${ds}${evs ? `，${evs.length} 项事项` : ""}`}
            >
              <span>{d}</span>
              <span style={{ display: "flex", gap: 1.5, height: 3, alignItems: "center" }}>
                {evs?.slice(0, 3).map((_, j) => (
                  <i key={`e${j}`} style={{ width: 3, height: 3, borderRadius: 1, background: isToday ? "#fff" : "var(--n-accent)" }} />
                ))}
                {ts && ts.length > 0 && (
                  <i style={{ width: 3, height: 3, borderRadius: 0.5, background: isToday ? "#fff" : "#3b82f6" }} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* 选中日期详情：当日事项 + 距最近目标日天数 */}
      <div style={{ marginTop: 8, borderTop: "1px dashed var(--n-border)", paddingTop: 6, minHeight: 0, overflow: "auto", flex: compact ? 1 : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="nlabel">
            {sel.slice(5).replace("-", ".")} · 周{WEEKDAYS_CN[(parseDay(sel).getDay() + 6) % 7]}
          </span>
          {nextMilestone && (
            <span className="nlabel">
              距 {nextMilestone.title}{" "}
              <b className="font-dot" style={{ color: "var(--n-accent)", fontSize: 12 }}>
                {diffDays(sel, nextMilestone.targetDate)}
              </b>{" "}
              天
            </span>
          )}
        </div>
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          {selEvents.length === 0 && selTasks.length === 0 && (
            <span style={{ color: "var(--n-faint)", fontSize: 10 }}>— 无事项 —</span>
          )}
          {selEvents.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 6, fontSize: 10, alignItems: "baseline" }}>
              <span style={{ color: "var(--n-dim)", flex: "none", width: 58 }}>
                {e.startMin != null ? minToHHMM(e.startMin) : "全天"}
              </span>
              <span style={{ color: "var(--n-faint)", flex: "none" }}>
                [{EVENT_KIND_LABEL[e.kind] ?? "事项"}]
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
            </div>
          ))}
          {selTasks.map((t) => (
            <div key={`t${t.id}`} style={{ display: "flex", gap: 6, fontSize: 10, alignItems: "baseline" }}>
              <span style={{ color: "#3b82f6", flex: "none", width: 58 }}>任务</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--n-faint)" : "var(--n-text)" }}>
                {t.title}
              </span>
              {t.done && <span style={{ color: "var(--n-faint)", flex: "none" }}>✓</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
