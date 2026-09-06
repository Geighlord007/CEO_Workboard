import { trpc } from "@/providers/trpc";
import { useCountUp } from "@/hooks/useCountUp";
import { thisMondayStr } from "@/lib/dates";

const SEGS = 10;

/** 本周完成率：电池造型 + 分段点阵 + 大号点阵数字（根据任务完成情况自动计算） */
export function BatteryCard({ compact }: { compact: boolean }) {
  const { data: tasks } = trpc.task.listWeek.useQuery({ weekOf: thisMondayStr() });

  const total = (tasks ?? []).length;
  const done = (tasks ?? []).filter((t) => t.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const shown = useCountUp(pct);
  const lit = Math.round((pct / 100) * SEGS);
  // 低电量变红（Nothing 红的语义化使用）
  const segColor = pct < 40 ? "var(--n-accent)" : "var(--n-text)";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: compact ? 8 : 12 }}>
      <svg viewBox="0 0 200 66" style={{ width: "100%", maxWidth: 220, display: "block" }} role="img" aria-label={`本周完成率 ${pct}%`}>
        <rect x="3" y="8" width="178" height="50" rx="8" fill="none" stroke="var(--n-text)" strokeWidth="1.5" />
        <rect x="184" y="22" width="9" height="22" rx="2.5" fill="var(--n-dim)" />
        {Array.from({ length: SEGS }).map((_, i) => (
          <rect
            key={i}
            x={10 + i * 17}
            y={16}
            width={12}
            height={34}
            rx={2}
            fill={i < lit ? segColor : "none"}
            stroke={i < lit ? "none" : "var(--n-lv1)"}
            strokeWidth="1"
          />
        ))}
      </svg>
      <div className="font-dot" style={{ fontSize: compact ? 34 : 46, lineHeight: 1 }}>
        {shown}
        <span style={{ fontSize: "0.42em", color: "var(--n-dim)" }}>%</span>
      </div>
      <div className="nlabel">
        {done} / {total} 项 · 本周
      </div>
    </div>
  );
}
