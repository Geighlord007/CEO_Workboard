import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { useNow } from "@/hooks/useNow";
import { useTip } from "./Tooltip";
import {
  addDays,
  dayFmt,
  minToHHMM,
  mondayOf,
  pad2,
  todayStr,
  WEEKDAYS_CN,
} from "@/lib/dates";

const BLOCKS = [
  { label: "上午", from: 6 * 60, to: 12 * 60 },
  { label: "下午", from: 12 * 60, to: 18 * 60 },
  { label: "晚间", from: 18 * 60, to: 24 * 60 },
];

/** 今日日程时间线 + 一周点阵概览；进行中课程红色高亮并显示剩余分钟，状态每 30s 自动更新 */
export function ScheduleCard({ compact }: { compact: boolean }) {
  const now = useNow(30_000);
  const tip = useTip();
  const { data: events } = trpc.event.list.useQuery();
  const { data: datedTasks } = trpc.task.listDated.useQuery();

  const today = todayStr();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todayTasks = useMemo(
    () => (datedTasks ?? []).filter((t) => t.dueDate === today),
    [datedTasks, today],
  );

  const todays = useMemo(
    () =>
      (events ?? [])
        .filter((e) => e.date === today)
        .sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1)),
    [events, today],
  );

  const ongoing = todays.find(
    (e) => e.startMin != null && e.endMin != null && e.startMin <= nowMin && nowMin < e.endMin,
  );
  const next = todays.find((e) => e.startMin != null && e.startMin > nowMin);

  // 本周点阵概览：7 天 × 3 时段
  const mon = mondayOf(now);
  const weekDays = Array.from({ length: 7 }, (_, i) => dayFmt(addDays(mon, i)));
  const weekMap = useMemo(() => {
    const m = new Map<string, boolean[]>();
    for (const d of weekDays) m.set(d, [false, false, false]);
    for (const e of events ?? []) {
      const row = m.get(e.date);
      if (!row) continue;
      if (e.startMin == null) {
        row[0] = row[1] = row[2] = true; // 全天事项占满三格
      } else {
        const bi = BLOCKS.findIndex((b) => e.startMin! >= b.from && e.startMin! < b.to);
        if (bi >= 0) row[bi] = true;
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const eventsOn = (d: string, bi: number) =>
    (events ?? []).filter((e) => {
      if (e.date !== d) return false;
      if (e.startMin == null) return true;
      return e.startMin >= BLOCKS[bi].from && e.startMin < BLOCKS[bi].to;
    });

  return (
    <>
      {/* 状态行 */}
      <div style={{ fontSize: 11 }}>
        {ongoing ? (
          <span style={{ color: "var(--n-accent)" }}>
            ● 进行中 · {ongoing.title} · 剩 {ongoing.endMin! - nowMin} 分
          </span>
        ) : next ? (
          <span style={{ color: "var(--n-dim)" }}>
            ○ 下一场 {minToHHMM(next.startMin!)} · {next.title}
          </span>
        ) : (
          <span style={{ color: "var(--n-faint)" }}>
            — {todays.length > 0 ? "今日安排已结束" : "今日无日程"} —
          </span>
        )}
      </div>

      {/* 今日时间线 */}
      <div className="ndim-list" style={{ marginTop: 8, flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {todays.length === 0 && todayTasks.length === 0 && (
          <div className="nlabel" style={{ margin: "auto" }}>— FREE DAY —</div>
        )}
        {todayTasks.map((t) => (
          <div
            key={`t${t.id}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              padding: "4px 6px",
              borderRadius: 5,
              borderLeft: `2px solid ${t.done ? "var(--n-lv1)" : "#3b82f6"}`,
              opacity: t.done ? 0.45 : 1,
            }}
          >
            <span className="font-dot" style={{ fontSize: 11, flex: "none", width: 76, color: t.done ? "var(--n-faint)" : "#3b82f6" }}>
              任务
            </span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--n-faint)" : "var(--n-text)" }}>
              {t.title}
            </span>
          </div>
        ))}
        {todays.map((e) => {
          const isOn = ongoing?.id === e.id;
          const past = e.endMin != null && e.endMin <= nowMin;
          return (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                padding: "4px 6px",
                borderRadius: 5,
                background: isOn ? "var(--n-card2)" : "transparent",
                borderLeft: `2px solid ${isOn ? "var(--n-accent)" : past ? "var(--n-lv1)" : "var(--n-dim)"}`,
                opacity: past ? 0.45 : 1,
              }}
            >
              <span className="font-dot" style={{ fontSize: 11, flex: "none", width: 76, color: isOn ? "var(--n-accent)" : "var(--n-dim)" }}>
                {e.startMin != null ? `${minToHHMM(e.startMin)}–${e.endMin != null ? minToHHMM(e.endMin) : "…"}` : "全天"}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: isOn ? "var(--n-accent)" : "var(--n-text)" }}>
                {e.title}
                {isOn && <span style={{ marginLeft: 6, fontSize: 10 }}>剩 {e.endMin! - nowMin}′</span>}
              </span>
              {e.location && (
                <span style={{ color: "var(--n-faint)", fontSize: 10, flex: "none" }}>{e.location}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 一周点阵概览 */}
      {!compact && (
        <div style={{ marginTop: 8, borderTop: "1px dashed var(--n-border)", paddingTop: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {weekDays.map((d, di) => (
              <div key={d} className="nlabel" style={{ textAlign: "center", fontSize: 9, letterSpacing: "0.05em", color: d === today ? "var(--n-accent)" : "var(--n-faint)" }}>
                {WEEKDAYS_CN[di]} {pad2(Number(d.slice(8)))}
              </div>
            ))}
            {weekDays.map((d) =>
              BLOCKS.map((_, bi) => {
                const filled = weekMap.get(d)?.[bi];
                const evs = eventsOn(d, bi);
                return (
                  <i
                    key={`${d}-${bi}`}
                    onMouseEnter={(e) =>
                      evs.length > 0 &&
                      tip.show(
                        { title: `${d.slice(5)} ${BLOCKS[bi].label}`, lines: evs.map((x) => x.title) },
                        e.clientX,
                        e.clientY,
                      )
                    }
                    onMouseMove={(e) => tip.move(e.clientX, e.clientY)}
                    onMouseLeave={tip.hide}
                    style={{
                      height: 8,
                      borderRadius: 1.5,
                      border: `1px solid ${d === today ? "var(--n-accent)" : "var(--n-border-soft)"}`,
                      background: filled ? (d === today ? "var(--n-accent)" : "var(--n-lv2)") : "transparent",
                      cursor: evs.length ? "default" : undefined,
                    }}
                  />
                );
              }),
            )}
          </div>
        </div>
      )}
    </>
  );
}
