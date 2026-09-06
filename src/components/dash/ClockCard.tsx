import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNow } from "@/hooks/useNow";
import { useCountUp } from "@/hooks/useCountUp";
import { diffDays, pad2, todayStr, WEEKDAYS_CN, weekNo } from "@/lib/dates";

const TOTAL_DOTS = 42; // 倒计时像素点阵总数

/** 时钟 + 关键节点倒计时：42 个像素点表示剩余进度，每过一天熄灭；支持增/改/删节点 */
export function ClockCard({ compact }: { compact: boolean }) {
  const now = useNow(1000);
  const utils = trpc.useUtils();
  const { data: ms } = trpc.milestone.list.useQuery();
  const invalidate = () => utils.milestone.list.invalidate();
  const create = trpc.milestone.create.useMutation({ onSuccess: invalidate });
  const update = trpc.milestone.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.milestone.remove.useMutation({ onSuccess: invalidate });

  // 表单状态：id 存在=编辑，否则=新增
  const [editing, setEditing] = useState<null | {
    id?: number;
    title: string;
    startDate: string;
    targetDate: string;
  }>(null);

  const today = todayStr();
  const upcoming = (ms ?? []).filter((m) => diffDays(today, m.targetDate) >= 0);
  const main = upcoming[0];
  const rest = upcoming.slice(1, compact ? 1 : 3);

  const remain = main ? diffDays(today, main.targetDate) : 0;
  const shownRemain = useCountUp(remain);

  const total = main ? Math.max(diffDays(main.startDate, main.targetDate), 1) : 1;
  const lit = main ? Math.max(0, Math.round((remain / total) * TOTAL_DOTS)) : 0;

  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  const wd = WEEKDAYS_CN[(now.getDay() + 6) % 7];

  const submitForm = () => {
    if (!editing || !editing.title.trim()) return;
    const payload = {
      title: editing.title.trim(),
      startDate: editing.startDate || today,
      targetDate: editing.targetDate || today,
    };
    if (editing.id != null) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
    setEditing(null);
  };

  const busy = create.isPending || update.isPending;

  return (
    <>
      {/* 时钟 + 添加按钮 */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span className="font-dot" style={{ fontSize: compact ? 30 : 38, lineHeight: 1 }}>
              {hh}
              <span className="n-blink">:</span>
              {mm}
              <span style={{ fontSize: "0.45em", color: "var(--n-dim)" }}>:{ss}</span>
            </span>
          </div>
          <div className="nlabel" style={{ marginTop: 6 }}>
            {now.getFullYear()}.{pad2(now.getMonth() + 1)}.{pad2(now.getDate())} · 周{wd} · W{weekNo(now)}
          </div>
        </div>
        <button
          className="nbtn"
          style={{ flex: "none" }}
          onClick={() => setEditing({ title: "", startDate: today, targetDate: today })}
          title="添加关键节点"
        >
          ＋节点
        </button>
      </div>

      {/* 新增 / 编辑表单 */}
      {editing && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            border: "1px solid var(--n-border)",
            borderRadius: 8,
            background: "var(--n-card2)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <input
            className="ninput"
            autoFocus
            placeholder="节点名称，如：Q3 董事会"
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submitForm()}
            maxLength={100}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="ninput"
              type="date"
              value={editing.startDate}
              onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
              aria-label="开始日期"
            />
            <span className="nlabel">→</span>
            <input
              className="ninput"
              type="date"
              value={editing.targetDate}
              onChange={(e) => setEditing({ ...editing, targetDate: e.target.value })}
              aria-label="目标日期"
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="nbtn nbtn-accent" onClick={submitForm} disabled={busy}>
              保存
            </button>
            <button className="nbtn" onClick={() => setEditing(null)}>
              取消
            </button>
          </div>
        </div>
      )}

      <hr className="n-dashline" style={{ margin: "10px 0 8px" }} />

      {main ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="nlabel" style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>NEXT · {main.title}</span>
              <button className="nicon" title="编辑" onClick={() => setEditing({ id: main.id, title: main.title, startDate: main.startDate, targetDate: main.targetDate })}>
                ✎
              </button>
              <button className="nicon" title="删除" onClick={() => remove.mutate({ id: main.id })}>
                ×
              </button>
            </span>
            <span className="font-dot" style={{ fontSize: compact ? 22 : 28, lineHeight: 1, flex: "none" }}>
              <span className="nlabel" style={{ letterSpacing: "0.1em" }}>D-</span>
              <span style={{ color: remain <= 3 ? "var(--n-accent)" : "var(--n-text)" }}>{shownRemain}</span>
            </span>
          </div>
          {/* 42 像素点阵：7×6 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(21, 1fr)",
              gap: 3,
              marginTop: 8,
            }}
            role="img"
            aria-label={`距离${main.title}还有 ${remain} 天`}
          >
            {Array.from({ length: TOTAL_DOTS }).map((_, i) => (
              <i
                key={i}
                style={{
                  aspectRatio: "1",
                  borderRadius: 1,
                  background:
                    i < lit
                      ? remain <= 3
                        ? "var(--n-accent)"
                        : "var(--n-text)"
                      : "var(--n-lv1)",
                  opacity: i < lit ? 1 : 0.45,
                }}
              />
            ))}
          </div>
          {!compact && rest.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
              {rest.map((m) => {
                const r = diffDays(today, m.targetDate);
                const t = Math.max(diffDays(m.startDate, m.targetDate), 1);
                const l = Math.max(0, Math.round((r / t) * 14));
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="nlabel" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.title}
                    </span>
                    <button className="nicon" title="编辑" onClick={() => setEditing({ id: m.id, title: m.title, startDate: m.startDate, targetDate: m.targetDate })}>
                      ✎
                    </button>
                    <button className="nicon" title="删除" onClick={() => remove.mutate({ id: m.id })}>
                      ×
                    </button>
                    <span style={{ display: "inline-flex", gap: 2 }}>
                      {Array.from({ length: 14 }).map((_, i) => (
                        <i key={i} style={{ width: 4, height: 4, borderRadius: 1, background: i < l ? "var(--n-dim)" : "var(--n-lv1)", opacity: i < l ? 1 : 0.5 }} />
                      ))}
                    </span>
                    <span className="font-dot" style={{ fontSize: 12, color: "var(--n-dim)", width: 42, textAlign: "right" }}>
                      D-{r}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="nlabel" style={{ margin: "auto" }}>
          — 暂无关键节点 · 点右上「＋节点」添加 —
        </div>
      )}
    </>
  );
}
