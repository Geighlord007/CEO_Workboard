import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { OPP_STAGE_ORDER, OPP_STAGE_LABEL, fmtMoney } from "@/components/crm/crmMeta";

/**
 * 看板「客户推进」卡 = CRM 业务-商机（同一份数据）
 * 只列进行中商机（识别 → 交付执行），赢单/输单进 KPI 计数；不再显示"潜在"客户行
 */
export function OppPipelineCard() {
  const utils = trpc.useUtils();
  const { data: opps } = trpc.crm.opportunity.list.useQuery({});
  const { data: accounts } = trpc.crm.account.list.useQuery();
  const move = trpc.crm.opportunity.update.useMutation({
    onSuccess: () => utils.crm.opportunity.list.invalidate(),
  });

  const accName = useMemo(() => {
    const m = new Map<number, string>();
    (accounts ?? []).forEach((a) => m.set(a.id, a.name));
    return m;
  }, [accounts]);

  const pos = (s: string) => {
    const i = OPP_STAGE_ORDER.indexOf(s as (typeof OPP_STAGE_ORDER)[number]);
    return i >= 0 ? i : OPP_STAGE_ORDER.length - 1;
  };

  const open = useMemo(
    () =>
      (opps ?? [])
        .filter((o) => o.stage !== "won" && o.stage !== "lost")
        .sort((a, b) => pos(b.stage) - pos(a.stage)),
    [opps],
  );
  const won = (opps ?? []).filter((o) => o.stage === "won").length;
  const lost = (opps ?? []).filter((o) => o.stage === "lost").length;
  const amount = open.reduce((a, o) => a + Number(o.amountCny ?? 0), 0);

  const step = (o: { id: number; stage: string }, dir: -1 | 1) => {
    const next = OPP_STAGE_ORDER[pos(o.stage) + dir];
    if (!next) return;
    if (next === "lost") {
      const reason = window.prompt("输单原因（必填）");
      if (!reason) return;
      move.mutate({ id: o.id, patch: { stage: "lost", lostReason: reason } });
      return;
    }
    move.mutate({ id: o.id, patch: { stage: next } });
  };

  const bar = (idx: number) => Math.min(1, Math.max(0, (idx + 1) / OPP_STAGE_ORDER.length));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", gap: 12, flex: "none", paddingBottom: 6, borderBottom: "1px dashed var(--n-border)" }}>
        <span className="font-dot" style={{ fontSize: 13, color: "var(--n-text)" }}>{open.length}</span>
        <span className="nlabel" style={{ color: "var(--n-faint)" }}>进行中商机 · {fmtMoney(amount)}</span>
        <span className="nlabel" style={{ marginLeft: "auto", color: won ? "#22c55e" : "var(--n-faint)" }}>✓ {won}</span>
        <span className="nlabel" style={{ color: lost ? "var(--n-accent)" : "var(--n-faint)" }}>✕ {lost}</span>
      </div>

      <div className="ndim-list" style={{ flex: 1, minHeight: 0, overflow: "auto", paddingTop: 6 }}>
        {open.length === 0 && (
          <div className="nlabel" style={{ color: "var(--n-faint)", textAlign: "center", padding: "12px 0" }}>
            — 暂无进行中商机 · 去 CRM 业务-商机 新建 —
          </div>
        )}
        {open.map((o) => {
          const idx = pos(o.stage);
          return (
            <div key={o.id} style={{ padding: "3px 0", fontSize: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--n-text)" }}>
                  {accName.get(o.accountId) ?? `客户#${o.accountId}`}
                  <span style={{ color: "var(--n-dim)" }}> · {o.title}</span>
                </span>
                {o.amountCny != null && (
                  <span className="nlabel" style={{ flex: "none", fontSize: 9 }}>{fmtMoney(Number(o.amountCny))}</span>
                )}
                <span className="nlabel" style={{ flex: "none", fontSize: 9, whiteSpace: "nowrap", color: "var(--n-dim)" }}>
                  {OPP_STAGE_LABEL[o.stage]} {idx + 1}/{OPP_STAGE_ORDER.length}
                </span>
                <button className="nicon" title="回退上一步" onClick={() => step(o, -1)}>◀</button>
                <button className="nicon" title="推进下一步" onClick={() => step(o, 1)}>▶</button>
              </div>
              <div style={{ height: 3, marginTop: 2, background: "color-mix(in srgb, var(--n-border-soft) 60%, transparent)", borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${bar(idx) * 100}%`,
                    background: "linear-gradient(90deg, var(--nx-c1), var(--nx-c3))",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
