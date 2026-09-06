import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { useTip } from "./Tooltip";
import { useCountUp } from "@/hooks/useCountUp";
import { addDays, dayFmt, mondayOf, todayStr } from "@/lib/dates";

const WEEKS = 12;

/** 完成任务数 → 强度等级：0=无，1=1-2 项，2=3-4 项，3=5+ 项 */
const countToLevel = (c: number) => (c <= 0 ? 0 : c <= 2 ? 1 : c <= 4 ? 2 : 3);
const LEVEL_DESC = ["无产出", "1-2 项", "3-4 项", "5+ 项"];

/** 通栏学习/产出打卡热力图：最近 12 周，今日格子可点击循环 4 级强度，实时重算 */
export function HeatmapCard() {
  const utils = trpc.useUtils();
  const tip = useTip();
  const today = todayStr();

  // 起点：本周周一往前 11 周，共 12 周列
  const start = addDays(mondayOf(new Date()), -(WEEKS - 1) * 7);
  const from = dayFmt(start);

  const { data: counts } = trpc.task.counts.useQuery({ days: WEEKS * 7 });
  const { data: act } = trpc.activity.range.useQuery({ from, to: today });
  const setLevel = trpc.activity.setLevel.useMutation({
    onSuccess: () => utils.activity.range.invalidate(),
  });

  // 逐日单元格（到昨天为止 + 今天），周一到周日按列填充
  const cells = useMemo(() => {
    const cmap = new Map((counts ?? []).map((r) => [r.day, r.c]));
    const amap = new Map((act ?? []).map((r) => [r.day, r.level]));
    const totalDays = Math.round((Date.now() - start.getTime()) / 86400000) + 1;
    return Array.from({ length: totalDays }, (_, i) => {
      const day = dayFmt(addDays(start, i));
      const count = cmap.get(day) ?? 0;
      const override = amap.get(day);
      const level = override != null ? override : countToLevel(count);
      return { day, count, level, manual: override != null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, act]);

  // 连续打卡：从今天（若今天为空则从昨天）往前数 level>0
  const streak = useMemo(() => {
    let s = 0;
    let i = cells.length - 1;
    if (i >= 0 && cells[i].level === 0) i--; // 今天还没产出不算断签
    for (; i >= 0; i--) {
      if (cells[i].level > 0) s++;
      else break;
    }
    return s;
  }, [cells]);

  const activeDays = cells.filter((c) => c.level > 0).length;
  const rate = cells.length ? Math.round((activeDays / cells.length) * 100) : 0;
  const shownStreak = useCountUp(streak);
  const shownRate = useCountUp(rate);

  const todayCell = cells[cells.length - 1];
  const cycleToday = () => {
    if (!todayCell || setLevel.isPending) return;
    setLevel.mutate({ day: today, level: (todayCell.level + 1) % 4 });
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14 }}>
      {/* 左：星期 gutter + 格子矩阵 */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateRows: "repeat(7, 1fr)", gap: 3, flex: "none" }}>
          {["一", "", "三", "", "五", "", "日"].map((w, i) => (
            <span key={i} className="nlabel" style={{ fontSize: 8, letterSpacing: 0, alignSelf: "center" }}>
              {w}
            </span>
          ))}
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "grid",
            gridTemplateRows: "repeat(7, minmax(0, 1fr))",
            gridAutoFlow: "column",
            gap: 3,
          }}
        >
          {cells.map((c) => {
            const isToday = c.day === today;
            const props = {
              "data-lv": c.level,
              className: `hm-cell${isToday ? " today" : ""}`,
              title: undefined,
              onMouseEnter: (e: React.MouseEvent) =>
                tip.show(
                  {
                    title: c.day,
                    lines: [
                      `完成 ${c.count} 项 · ${LEVEL_DESC[c.level]}`,
                      c.manual ? "强度为手动覆盖" : "强度自动统计",
                      ...(isToday ? ["点击循环调整今日强度"] : []),
                    ],
                  },
                  e.clientX,
                  e.clientY,
                ),
              onMouseMove: (e: React.MouseEvent) => tip.move(e.clientX, e.clientY),
              onMouseLeave: tip.hide,
            };
            return isToday ? (
              <button key={c.day} {...props} onClick={cycleToday} aria-label="调整今日打卡强度" />
            ) : (
              <i key={c.day} {...props} />
            );
          })}
        </div>
      </div>

      {/* 右：统计 + 图例 */}
      <div style={{ flex: "none", width: 132, borderLeft: "1px dashed var(--n-border)", paddingLeft: 14, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
        <div>
          <div className="font-dot" style={{ fontSize: 26, lineHeight: 1 }}>{shownStreak}</div>
          <div className="nlabel" style={{ marginTop: 2 }}>连续打卡 · 天</div>
        </div>
        <div>
          <div className="font-dot" style={{ fontSize: 26, lineHeight: 1 }}>
            {shownRate}
            <span style={{ fontSize: "0.45em", color: "var(--n-dim)" }}>%</span>
          </div>
          <div className="nlabel" style={{ marginTop: 2 }}>打卡率 · {WEEKS} 周</div>
        </div>
        <div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {[0, 1, 2, 3].map((lv) => (
              <i key={lv} className="hm-cell" data-lv={lv} style={{ width: 10, height: 10, aspectRatio: "auto" }} />
            ))}
          </div>
          <div className="nlabel" style={{ marginTop: 4, letterSpacing: "0.08em" }}>少 → 多</div>
        </div>
      </div>
    </div>
  );
}
