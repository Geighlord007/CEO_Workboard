import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { useMeasure } from "@/hooks/useMeasure";
import { useTip } from "./Tooltip";
import { addDays, dayFmt, minToHHMM, todayStr } from "@/lib/dates";

const DAYS = 14;
const LO = 17 * 60; // 纵轴下限 17:00
const HI = 24 * 60 + 59; // 纵轴上限 24:59

/** 近 14 天收工时间散点：像素方块，最晚记录标红，可一键记录今天收工 */
export function OffworkCard() {
  const utils = trpc.useUtils();
  const from = dayFmt(addDays(new Date(), -(DAYS - 1)));
  const { data: rows } = trpc.activity.range.useQuery({ from, to: todayStr() });
  const setOffwork = trpc.activity.setOffwork.useMutation({
    onSuccess: () => utils.activity.range.invalidate(),
  });
  const [ref, { w, h }] = useMeasure<HTMLDivElement>();
  const tip = useTip();

  const series = useMemo(() => {
    const map = new Map((rows ?? []).map((r) => [r.day, r.offworkMin]));
    return Array.from({ length: DAYS }, (_, i) => {
      const day = dayFmt(addDays(new Date(), -(DAYS - 1 - i)));
      return { day, v: map.get(day) ?? null };
    });
  }, [rows]);

  const valid = series.filter((s) => s.v != null) as { day: string; v: number }[];
  const avg = valid.length ? valid.reduce((a, s) => a + s.v, 0) / valid.length : null;
  const latest = valid.length ? valid.reduce((m, s) => (s.v > m.v ? s : m)) : null;

  const padL = 34;
  const padR = 8;
  const padT = 10;
  const padB = 18;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const x = (i: number) => padL + (i / (DAYS - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((Math.max(v, LO) - LO) / (HI - LO)) * plotH;

  const recordToday = () => {
    const n = new Date();
    setOffwork.mutate({ day: todayStr(), minutes: n.getHours() * 60 + n.getMinutes() });
  };

  return (
    <>
      <div ref={ref} style={{ flex: 1, minHeight: 0 }}>
        {w > 0 && h > 0 && (
          <svg width={w} height={h} style={{ display: "block" }}>
            {/* 横向虚线网格 + 时间刻度 */}
            {[18 * 60, 21 * 60, 24 * 60].map((t) => (
              <g key={t}>
                <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--n-border)" strokeDasharray="2 4" strokeWidth="0.6" />
                <text x={padL - 5} y={y(t) + 3} textAnchor="end" fontSize="8" fill="var(--n-faint)" className="font-dot">
                  {minToHHMM(t)}
                </text>
              </g>
            ))}
            {/* 平均收工线 */}
            {avg != null && (
              <line x1={padL} x2={w - padR} y1={y(avg)} y2={y(avg)} stroke="var(--n-dim)" strokeDasharray="5 4" strokeWidth="0.8" />
            )}
            {/* 散点：最晚标红 */}
            {series.map((s, i) => {
              if (s.v == null) return null;
              const isLatest = latest != null && s.day === latest.day;
              return (
                <g key={s.day}>
                  <rect
                    x={x(i) - 3}
                    y={y(s.v) - 3}
                    width={6}
                    height={6}
                    fill={isLatest ? "var(--n-accent)" : "var(--n-card)"}
                    stroke={isLatest ? "var(--n-accent)" : "var(--n-text)"}
                    strokeWidth="1"
                  />
                  {isLatest && (
                    <text x={x(i)} y={y(s.v) - 7} textAnchor="middle" fontSize="8" fill="var(--n-accent)" className="font-dot">
                      {minToHHMM(s.v)}
                    </text>
                  )}
                  <rect
                    x={x(i) - plotW / DAYS / 2}
                    y={padT}
                    width={plotW / DAYS}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={(e) =>
                      tip.show({ title: s.day, lines: [`收工 ${minToHHMM(s.v!)}`] }, e.clientX, e.clientY)
                    }
                    onMouseMove={(e) => tip.move(e.clientX, e.clientY)}
                    onMouseLeave={tip.hide}
                  />
                </g>
              );
            })}
            {valid.length === 0 && (
              <text x={w / 2} y={h / 2} textAnchor="middle" fontSize="10" fill="var(--n-faint)" letterSpacing="2">
                — 暂无记录 —
              </text>
            )}
          </svg>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, flex: "none" }}>
        <span className="nlabel">
          {avg != null ? `平均收工 ${minToHHMM(Math.round(avg))}` : "— 暂无数据 —"}
        </span>
        <button className="nbtn" onClick={recordToday} disabled={setOffwork.isPending} title="把此刻记为今天收工时间">
          ● 记录收工
        </button>
      </div>
    </>
  );
}
