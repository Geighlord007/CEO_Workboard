import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { isArchivedStage, STAGE_FLOW, STAGE_LABELS } from "@contracts/crm";
import { OPP_STAGE_ORDER, OPP_STAGE_LABEL, fmtMoney } from "@/components/crm/crmMeta";

/**
 * 推进卡（客户 / 供应商）
 * - 客户：每行 = 一家客户，行内嵌该客户的商机（deal）进度条 + 金额；
 *   商机推进直接写 crm.opportunity（与 CRM「商机」页同一份数据）
 * - 供应商：每行 = 一家供应商的合同级推进（交流→询价→NDA→合同→执行中→合同结束/终止），
 *   金额/起止日期来自 suppliers 表（与 CRM「供应商」页同一份数据）
 * - 所有操作都支持 ◀ 回退，误点可复原
 */
export function PipelineCard({ relType }: { relType: "client" | "supplier" }) {
  const utils = trpc.useUtils();
  const { data: accounts } = trpc.crm.account.list.useQuery(undefined, {
    enabled: relType === "client",
  });
  const { data: opps } = trpc.crm.opportunity.list.useQuery({}, { enabled: relType === "client" });
  const { data: suppliers } = trpc.crm.supplier.list.useQuery(undefined, {
    enabled: relType === "supplier",
  });

  /** 组件内只依赖这些字段（数据来自 tRPC，字段比这里更全，结构兼容） */
  type OppLite = { id: number; accountId: number; title: string; stage: string; amountCny: string | null };
  type SuppLite = { id: number; name: string; stage: string; amountCny: string | null; updatedAt: Date };

  const createRel = trpc.crm.relationship.create.useMutation({
    onSuccess: () => utils.crm.relationship.list.invalidate(),
  });
  const setRelStage = trpc.crm.relationship.setStage.useMutation({
    onSuccess: () => {
      utils.crm.relationship.list.invalidate();
      utils.crm.supplier.list.invalidate();
    },
  });
  const createOpp = trpc.crm.opportunity.create.useMutation({
    onSuccess: () => utils.crm.opportunity.list.invalidate(),
  });
  const moveOpp = trpc.crm.opportunity.update.useMutation({
    onSuccess: () => utils.crm.opportunity.list.invalidate(),
  });

  const [newName, setNewName] = useState("");

  const supplierFlow = STAGE_FLOW.supplier;
  const supplierLabelOf = (k: string) =>
    (STAGE_LABELS.supplier as Record<string, string>)[k] ?? k;

  const clientFlow = STAGE_FLOW.client;
  const clientLabelOf = (k: string) =>
    (STAGE_LABELS.client as Record<string, string>)[k] ?? k;

  const relLabel = relType === "client" ? "客户" : "供应商";

  /* ---------- 客户侧：客户 + 其商机 ---------- */
  const clientRows = useMemo(() => {
    if (relType !== "client") return [];
    const accs = (accounts ?? []).filter(
      (a) => a.relationshipType === "client" && !isArchivedStage("client", a.stage),
    );
    const byAcc = new Map<number, typeof opps>();
    (opps ?? []).forEach((o) => {
      const arr = byAcc.get(o.accountId);
      if (arr) arr.push(o);
      else byAcc.set(o.accountId, [o]);
    });
    return accs
      .map((a) => ({ acc: a, deals: (byAcc.get(a.id) ?? []).slice().reverse() }))
      .sort((x, y) => y.deals.length - x.deals.length);
  }, [relType, accounts, opps]);

  const oppOpen = (o: OppLite) => o.stage !== "won" && o.stage !== "lost";
  const oppPos = (stage: string) => {
    const i = OPP_STAGE_ORDER.indexOf(stage as (typeof OPP_STAGE_ORDER)[number]);
    return i >= 0 ? i : OPP_STAGE_ORDER.length - 1;
  };

  const stepOpp = (o: OppLite, dir: -1 | 1) => {
    const cur = oppPos(o.stage);
    const next = OPP_STAGE_ORDER[cur + dir];
    if (!next) return;
    if (next === "lost") {
      const reason = window.prompt("输单原因（必填）");
      if (!reason) return;
      moveOpp.mutate({ id: o.id, patch: { stage: "lost", lostReason: reason } });
      return;
    }
    moveOpp.mutate({ id: o.id, patch: { stage: next } });
  };

  /* ---------- 供应商侧：合同级推进 ---------- */
  const supplierRows = useMemo(() => {
    if (relType !== "supplier") return [];
    return (suppliers ?? []).slice().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [relType, suppliers]);

  const suppIdx = (stage: string) => supplierFlow.stages.indexOf(stage);
  const stepSupp = (s: SuppLite, dir: -1 | 1) => {
    const cur = suppIdx(s.stage);
    if (cur < 0) return;
    const next = supplierFlow.stages[cur + dir];
    if (next) setRelStage.mutate({ type: "supplier", id: s.id, stage: next });
  };

  /* 客户：没有商机时仍可推进“关系阶段”，并支持一键新建商机 */
  const clientIdx = (stage: string) => clientFlow.stages.indexOf(stage);
  const stepClient = (a: { id: number; stage: string }, dir: -1 | 1) => {
    const ci = clientIdx(a.stage);
    const next = clientFlow.stages[ci + dir];
    if (next) setRelStage.mutate({ type: "client", id: a.id, stage: next });
  };
  const archiveClient = (a: { id: number }) => {
    if (window.confirm("归档该客户（停用）？可在 CRM 关系列表恢复。")) {
      setRelStage.mutate({ type: "client", id: a.id, stage: clientFlow.terminal[0] });
    }
  };
  const newOpp = (a: { id: number; name: string }) => {
    const title = window.prompt(`为「${a.name}」新建商机：标题`);
    const t = (title ?? "").trim();
    if (!t) return;
    const amtStr = window.prompt("商机金额（元，可留空）", "");
    const amtNum = Number(amtStr);
    const amt =
      amtStr && amtStr.trim() !== "" && !Number.isNaN(amtNum) && amtNum >= 0 ? amtNum : null;
    createOpp.mutate({ accountId: a.id, title: t, amountCny: amt });
  };

  const submitCreate = () => {
    const v = newName.trim();
    if (!v || createRel.isPending) return;
    createRel.mutate({ type: relType, name: v });
    setNewName("");
  };

  /* ---------- 顶部 KPI ---------- */
  const kpi = useMemo(() => {
    if (relType === "client") {
      const open = (opps ?? []).filter(oppOpen);
      return {
        openCount: open.length,
        amount: open.reduce((a, o) => a + Number(o.amountCny ?? 0), 0),
        won: (opps ?? []).filter((o) => o.stage === "won").length,
        lost: (opps ?? []).filter((o) => o.stage === "lost").length,
      };
    }
    const act = supplierRows.filter((s) => !isArchivedStage("supplier", s.stage));
    return {
      openCount: act.length,
      amount: act.reduce((a, s) => a + Number(s.amountCny ?? 0), 0),
      won: supplierRows.filter((s) => s.stage === "completed").length,
      lost: supplierRows.filter((s) => s.stage === "terminated").length,
    };
  }, [relType, opps, supplierRows]);

  /* 进度条（0..1） */
  const bar = (idx: number, total: number) =>
    total <= 0 ? 0 : Math.min(1, Math.max(0, (idx + 1) / total));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* KPI */}
      <div style={{ display: "flex", gap: 12, flex: "none", paddingBottom: 6, borderBottom: "1px dashed var(--n-border)" }}>
        <span className="font-dot" style={{ fontSize: 13, color: "var(--n-text)" }}>
          {kpi.openCount}
        </span>
        <span className="nlabel" style={{ color: "var(--n-faint)" }}>进行中 · {fmtMoney(kpi.amount)}</span>
        <span className="nlabel" style={{ marginLeft: "auto", color: kpi.won ? "#22c55e" : "var(--n-faint)" }}>
          ✓ {kpi.won}
        </span>
        <span className="nlabel" style={{ color: kpi.lost ? "var(--n-accent)" : "var(--n-faint)" }}>
          ✕ {kpi.lost}
        </span>
      </div>

      {/* 列表 */}
      <div className="ndim-list" style={{ flex: 1, minHeight: 0, overflow: "auto", paddingTop: 6 }}>
        {relType === "client"
          ? clientRows.length === 0 && (
              <div className="nlabel" style={{ color: "var(--n-faint)", textAlign: "center", padding: "12px 0" }}>
                — 暂无进行中的{relLabel} —
              </div>
            )
          : supplierRows.length === 0 && (
              <div className="nlabel" style={{ color: "var(--n-faint)", textAlign: "center", padding: "12px 0" }}>
                — 暂无{relLabel} —
              </div>
            )}

        {relType === "client" &&
          clientRows.map(({ acc, deals }) => {
            const won = deals.filter((o) => o.stage === "won").length;
            const lost = deals.filter((o) => o.stage === "lost").length;
            return (
              <div key={acc.id} style={{ padding: "3px 0", fontSize: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 600, color: "var(--n-text)" }}>{acc.name}</span>
                  <span className="nlabel" style={{ color: "var(--n-faint)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {deals.length > 0
                      ? `${deals.length} 笔${won ? ` · ✓${won}` : ""}${lost ? ` · ✕${lost}` : ""}`
                      : "未建商机"}
                  </span>
                  <button className="nicon" title="为这家客户新建商机" onClick={() => newOpp(acc)}>＋商机</button>
                </div>
                {deals.map((o) => {
                  const idx = oppPos(o.stage);
                  const isEnd = o.stage === "won" || o.stage === "lost";
                  return (
                    <div key={o.id} style={{ padding: "2px 0 2px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isEnd ? "var(--n-faint)" : "var(--n-text)" }}>
                          {isEnd ? (o.stage === "won" ? "✓ " : "✕ ") : ""}
                          {o.title}
                        </span>
                        {o.amountCny != null && (
                          <span className="nlabel" style={{ flex: "none", fontSize: 9 }}>
                            {fmtMoney(Number(o.amountCny))}
                          </span>
                        )}
                        <span className="nlabel" style={{ flex: "none", fontSize: 9, whiteSpace: "nowrap", color: isEnd ? (o.stage === "won" ? "#22c55e" : "var(--n-accent)") : "var(--n-dim)" }}>
                          {isEnd ? OPP_STAGE_LABEL[o.stage] : `${OPP_STAGE_LABEL[o.stage]} ${idx + 1}/${OPP_STAGE_ORDER.length}`}
                        </span>
                        {!isEnd && (
                          <>
                            <button className="nicon" title="回退上一步" onClick={() => stepOpp(o, -1)}>◀</button>
                            <button className="nicon" title="推进下一步" onClick={() => stepOpp(o, 1)}>▶</button>
                          </>
                        )}
                      </div>
                      <div style={{ height: 3, marginTop: 2, background: "color-mix(in srgb, var(--n-border-soft) 60%, transparent)", borderRadius: 2, overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${isEnd ? 100 : bar(idx, OPP_STAGE_ORDER.length) * 100}%`,
                            background: o.stage === "lost" ? "var(--n-accent)" : o.stage === "won" ? "#22c55e" : "linear-gradient(90deg, var(--nx-c1), var(--nx-c3))",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {deals.length === 0 &&
                  (() => {
                    const ci = clientIdx(acc.stage);
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0 2px 12px" }}>
                        <span className="nlabel" style={{ flex: "none", color: "var(--n-dim)" }}>关系</span>
                        <span className="nlabel" style={{ flex: 1, color: "var(--n-text)" }}>
                          {clientLabelOf(acc.stage)}
                          {ci >= 0 ? ` ${ci + 1}/${clientFlow.stages.length}` : ""}
                        </span>
                        {ci > 0 && (
                          <button className="nicon" title="回退上一步" onClick={() => stepClient(acc, -1)}>◀</button>
                        )}
                        {ci >= 0 && ci < clientFlow.stages.length - 1 && (
                          <button className="nicon" title="推进到下一阶段" onClick={() => stepClient(acc, 1)}>▶</button>
                        )}
                        <button className="nicon" title="归档（停用）" onClick={() => archiveClient(acc)}>○</button>
                      </div>
                    );
                  })()}
              </div>
            );
          })}

        {relType === "supplier" &&
          supplierRows.map((s) => {
            const idx = suppIdx(s.stage);
            const arch = isArchivedStage("supplier", s.stage);
            return (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", padding: "3px 0", fontSize: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: arch ? "var(--n-faint)" : "var(--n-text)", textDecoration: arch ? "line-through" : "none" }}>
                    {arch ? (s.stage === "completed" ? "✓ " : "✕ ") : ""}
                    {s.name}
                  </span>
                  {s.amountCny != null && (
                    <span className="nlabel" style={{ flex: "none", fontSize: 9 }}>
                      {fmtMoney(Number(s.amountCny))}
                    </span>
                  )}
                  <span className="nlabel" style={{ flex: "none", fontSize: 9, whiteSpace: "nowrap", color: arch ? (s.stage === "completed" ? "#22c55e" : "var(--n-accent)") : "var(--n-dim)" }}>
                    {arch ? supplierLabelOf(s.stage) : `${supplierLabelOf(s.stage)} ${idx + 1}/${supplierFlow.stages.length}`}
                  </span>
                  {!arch && idx > 0 && (
                    <button className="nicon" title="回退上一步" onClick={() => stepSupp(s, -1)}>◀</button>
                  )}
                  {!arch && idx >= 0 && idx < supplierFlow.stages.length - 1 && (
                    <button className="nicon" title="推进下一步" onClick={() => stepSupp(s, 1)}>▶</button>
                  )}
                  {!arch && (
                    <>
                      <button className="nicon" title="合同结束（✓）" onClick={() => setRelStage.mutate({ type: "supplier", id: s.id, stage: "completed" })}>✓</button>
                      <button className="nicon nicon-danger" title="终止·弃用（✕）" onClick={() => setRelStage.mutate({ type: "supplier", id: s.id, stage: "terminated" })}>✕</button>
                    </>
                  )}
                  {arch && (
                    <button className="nicon" title="恢复为进行中" onClick={() => setRelStage.mutate({ type: "supplier", id: s.id, stage: supplierFlow.stages[supplierFlow.stages.length - 1] })}>↩</button>
                  )}
                </div>
                <div style={{ height: 3, marginTop: 2, background: "color-mix(in srgb, var(--n-border-soft) 60%, transparent)", borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${idx < 0 ? 0 : bar(idx, supplierFlow.stages.length) * 100}%`,
                      background: s.stage === "terminated" ? "var(--n-accent)" : s.stage === "completed" ? "#22c55e" : "linear-gradient(90deg, var(--nx-c1), var(--nx-c3))",
                    }}
                  />
                </div>
              </div>
            );
          })}
      </div>

      {/* 新增 */}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flex: "none" }}>
        <input
          className="ninput"
          style={{ flex: 1, minWidth: 80 }}
          placeholder={`新增${relLabel}…`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitCreate()}
          maxLength={200}
        />
        <button className="nbtn nbtn-accent" onClick={submitCreate} disabled={createRel.isPending}>＋</button>
      </div>
    </div>
  );
}
