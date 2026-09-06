import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { useMeasure } from "@/hooks/useMeasure";
import { useTip } from "./Tooltip";
import { addDays, dayFmt, pad2 } from "@/lib/dates";

const DAYS = 14;

/** 近 14 天完成趋势折线：细线 + 像素方块，平均线虚线，最大值标红 */
export function TrendCard() {
  const { data: counts } = trpc.task.counts.useQuery({ days: DAYS });
  const [ref, { w, h }] = useMeasure<HTMLDivElement>();
  const tip = useTip();

  const series = useMemo(() => {
    const map = new Map((counts ?? []).map((r) => [r.day, r.c]));
    return Array.from({ length: DAYS }, (_, i) => {
      const d = addDays(new Date(), -(DAYS - 1 - i));
      const day = dayFmt(d);
      return { day, v: map.get(day) ?? 0 };
    });
  }, [counts]);

  const padL = 22;
  const padR = 8;
  const padT = 12;
  const padB = 18;
  const maxV = Math.max(3, ...series.map((s) => s.v));
  const avg = series.reduce((a, s) => a + s.v, 0) / DAYS;
  const maxIdx = series.reduce((mi, s, i) => (s.v > series[mi].v ? i : mi), 0);

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const x = (i: number) => padL + (i / (DAYS - 1)) * plotW;
  const y = (v: number) => padT + plotH - (v / maxV) * plotH;
  const pts = series.map((s, i) => `${x(i)},${y(s.v)}`).join(" ");

  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0 }}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} style={{ display: "block" }}>
          {/* 虚线网格 */}
          {[0, 0.5, 1].map((r) => (
            <g key={r}>
              <line x1={padL} x2={w - padR} y1={y(maxV * r)} y2={y(maxV * r)} stroke="var(--n-border)" strokeDasharray="2 4" strokeWidth="0.6" />
              <text x={padL - 5} y={y(maxV * r) + 3} textAnchor="end" fontSize="8" fill="var(--n-faint)" className="font-dot">
                {Math.round(maxV * r)}
              </text>
            </g>
          ))}
          {/* 平均线 */}
          <line x1={padL} x2={w - padR} y1={y(avg)} y2={y(avg)} stroke="var(--n-dim)" strokeDasharray="5 4" strokeWidth="0.8" />
          <text x={w - padR} y={y(avg) - 4} textAnchor="end" fontSize="8" fill="var(--n-dim)" letterSpacing="1">
            AVG {avg.toFixed(1)}
          </text>
          {/* 折线 */}
          <polyline points={pts} fill="none" stroke="var(--n-text)" strokeWidth="1.2" strokeLinejoin="round" />
          {/* X 轴日期（隔天标） */}
          {series.map((s, i) =>
            i % 2 === 0 ? (
              <text key={s.day} x={x(i)} y={h - 5} textAnchor="middle" fontSize="8" fill="var(--n-faint)" className="font-dot">
                {pad2(Number(s.day.slice(5, 7)))}.{s.day.slice(8)}
              </text>
            ) : null,
          )}
          {/* 像素方块数据点（最大值标红），透明命中区 + tooltip */}
          {series.map((s, i) => {
            const isMax = i === maxIdx && s.v > 0;
            return (
              <g key={s.day}>
                <rect x={x(i) - 2.5} y={y(s.v) - 2.5} width={5} height={5} fill={isMax ? "var(--n-accent)" : "var(--n-card)"} stroke={isMax ? "var(--n-accent)" : "var(--n-text)"} strokeWidth="1" />
                {isMax && (
                  <text x={x(i)} y={y(s.v) - 7} textAnchor="middle" fontSize="8" fill="var(--n-accent)" className="font-dot">
                    MAX {s.v}
                  </text>
                )}
                <rect
                  x={x(i) - plotW / DAYS / 2}
                  y={padT}
                  width={plotW / DAYS}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={(e) =>
                    tip.show(
                      { title: s.day, lines: [`完成 ${s.v} 项`, `均值 ${avg.toFixed(1)} 项/天`] },
                      e.clientX,
                      e.clientY,
                    )
                  }
                  onMouseMove={(e) => tip.move(e.clientX, e.clientY)}
                  onMouseLeave={tip.hide}
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
