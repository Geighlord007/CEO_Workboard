import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { RISK_LEVEL_LABEL } from "@contracts/dash";

const LEVELS = ["high", "mid", "low"] as const;
const LEVEL_COLOR: Record<string, string> = {
  high: "var(--n-accent)",
  mid: "var(--n-text)",
  low: "var(--n-faint)",
};

/** 风险与阻塞：红灯项列表，支持新增 / 解决 / 删除 */
export function RisksCard({ compact }: { compact: boolean }) {
  const utils = trpc.useUtils();
  const { data: risks } = trpc.risk.list.useQuery();
  const invalidate = () => utils.risk.list.invalidate();
  const create = trpc.risk.create.useMutation({ onSuccess: invalidate });
  const setResolved = trpc.risk.setResolved.useMutation({ onSuccess: invalidate });
  const remove = trpc.risk.remove.useMutation({ onSuccess: invalidate });

  const [title, setTitle] = useState("");
  const [needFrom, setNeedFrom] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("mid");

  const submit = () => {
    const v = title.trim();
    if (!v || create.isPending) return;
    create.mutate({ title: v, needFrom: needFrom.trim() || null, level });
    setTitle("");
    setNeedFrom("");
  };

  const open = (risks ?? []).filter((r) => !r.resolved);
  const done = (risks ?? []).filter((r) => r.resolved);

  return (
    <>
      <div className="ndim-list" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {open.length === 0 && (
          <div className="nlabel" style={{ textAlign: "center", padding: "14px 0" }}>— 无阻塞 · 一路绿灯 —</div>
        )}
        {open.map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 7, padding: "5px 0", borderBottom: "1px dashed var(--n-border-soft)", alignItems: "flex-start" }}>
            <i style={{ width: 7, height: 7, borderRadius: 1.5, background: LEVEL_COLOR[r.level], flex: "none", marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>{r.title}</div>
              {!compact && (r.detail || r.needFrom) && (
                <div style={{ fontSize: 10, color: "var(--n-dim)", lineHeight: 1.6, marginTop: 1 }}>
                  {r.detail}
                  {r.needFrom && <span style={{ color: r.level === "high" ? "var(--n-accent)" : "var(--n-dim)" }}>　→ 需 {r.needFrom}</span>}
                </div>
              )}
            </div>
            <button className="nicon" title="标记解决" onClick={() => setResolved.mutate({ id: r.id, resolved: true })}>✓</button>
            <button className="nicon" title="删除" onClick={() => remove.mutate({ id: r.id })}>×</button>
          </div>
        ))}
        {done.map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 7, padding: "4px 0", opacity: 0.4, alignItems: "baseline" }}>
            <i style={{ width: 7, height: 7, borderRadius: 1.5, background: "var(--n-faint)", flex: "none" }} />
            <span style={{ flex: 1, fontSize: 10, textDecoration: "line-through" }}>{r.title}</span>
            <button className="nicon" title="重新打开" onClick={() => setResolved.mutate({ id: r.id, resolved: false })}>↺</button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8, flex: "none" }}>
        <input className="ninput" style={{ flex: 2, minWidth: 90 }} placeholder="新风险 / 阻塞…" value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} maxLength={200} />
        <input className="ninput" style={{ flex: 1, minWidth: 60 }} placeholder="需谁支持" value={needFrom}
          onChange={(e) => setNeedFrom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} maxLength={50} />
        <button className="nbtn" style={level === "high" ? { color: "var(--n-accent)", borderColor: "var(--n-accent)" } : {}}
          onClick={() => setLevel(LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length])} title="点击切换级别">
          {RISK_LEVEL_LABEL[level]}
        </button>
        <button className="nbtn nbtn-accent" onClick={submit} disabled={create.isPending}>＋</button>
      </div>
    </>
  );
}
