import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { dayFmt, todayStr, addDays, diffDays } from "@/lib/dates";
import {
  OPP_STAGE_LABEL,
  OPP_STAGE_ORDER,
  fmtMoney,
} from "./crmMeta";
import type { Opportunity } from "./types";

const VALIDATION_KEYS: (keyof Opportunity)[] = [
  "techDiscussionDone",
  "proposalSent",
  "sampleSent",
  "pocPassed",
  "ndaSigned",
  "contractSigned",
];

function validationCount(o: Opportunity) {
  return VALIDATION_KEYS.filter((k) => o[k]).length;
}

function activityDay(o: Opportunity): string | null {
  if (o.lastActivityAt) return dayFmt(new Date(o.lastActivityAt));
  if (o.createdAt) return dayFmt(new Date(o.createdAt));
  return null;
}

function isStale(o: Opportunity) {
  if (o.stage === "won" || o.stage === "lost") return false;
  const before = dayFmt(addDays(new Date(), -14));
  const day = activityDay(o);
  if (!day) return false;
  return day < before;
}

function staleDays(o: Opportunity): number | null {
  const day = activityDay(o);
  if (!day) return null;
  return diffDays(day, todayStr());
}

export function PipelinePage({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: accounts } = trpc.crm.account.list.useQuery();
  const { data: opps, isLoading } = trpc.crm.opportunity.list.useQuery({});

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);

  const [newAccountId, setNewAccountId] = useState<number | "">("");
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newStage, setNewStage] = useState<(typeof OPP_STAGE_ORDER)[number]>("identify");

  const createOpp = trpc.crm.opportunity.create.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const updateOpp = trpc.crm.opportunity.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });

  const accountMap = useMemo(() => {
    const map = new Map<number, string>();
    (accounts ?? []).forEach((a) => map.set(a.id, a.name));
    return map;
  }, [accounts]);

  const byStage = useMemo(() => {
    const map: Record<string, Opportunity[]> = {};
    OPP_STAGE_ORDER.forEach((s) => (map[s] = []));
    (opps ?? []).forEach((o) => {
      (map[o.stage] ??= []).push(o as Opportunity);
    });
    return map;
  }, [opps]);

  const submitNew = () => {
    const title = newTitle.trim();
    const accountId = Number(newAccountId);
    if (!title || !accountId) return;
    createOpp.mutate({
      accountId,
      title,
      stage: newStage,
      amountCny: newAmount ? Number(newAmount) : null,
    });
    setNewTitle("");
    setNewAmount("");
    setNewAccountId("");
    setNewStage("identify");
  };

  const stageTotal = (list: Opportunity[]) =>
    list.reduce((a, o) => a + Number(o.amountCny ?? 0), 0);

  const moveStage = (o: Opportunity, stage: string) => {
    if (stage === "lost") {
      const reason = window.prompt("输单原因（必填）");
      if (!reason) return;
      updateOpp.mutate({ id: o.id, patch: { stage: stage as (typeof OPP_STAGE_ORDER)[number], lostReason: reason } });
      return;
    }
    updateOpp.mutate({ id: o.id, patch: { stage: stage as (typeof OPP_STAGE_ORDER)[number] } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 新建商机：左对齐、与下方容器同宽、常驻标签 */}
      {isAdmin && (
        <div className="ncard" style={{ padding: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "10px 12px",
              alignItems: "end",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">客户 *</span>
              <select
                className="nselect"
                value={newAccountId}
                onChange={(e) => setNewAccountId(e.target.value ? Number(e.target.value) : "")}
                aria-label="客户"
              >
                <option value="">选择客户</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">商机标题 *</span>
              <input
                className="ninput"
                placeholder="输入商机标题"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">金额</span>
              <input
                className="ninput"
                type="number"
                placeholder="¥"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">阶段</span>
              <select
                className="nselect"
                value={newStage}
                onChange={(e) => setNewStage(e.target.value as (typeof OPP_STAGE_ORDER)[number])}
                aria-label="阶段"
              >
                {OPP_STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {OPP_STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button className="nbtn nbtn-accent" onClick={submitNew} disabled={createOpp.isPending}>
                ＋ 新建商机
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          加载中<span className="n-blink">●</span>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 8,
            alignItems: "flex-start",
          }}
        >
          {OPP_STAGE_ORDER.map((stage) => {
            const list = byStage[stage] ?? [];
            const isCollapsed = collapsed.has(stage);
            return (
              <section
                key={stage}
                className="ncard"
                style={{
                  flex: "0 0 auto",
                  width: "min(320px, 85vw)",
                  maxHeight: "calc(100dvh - 220px)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <header className="ncard-head">
                  <span className="nlabel">
                    <span className="nlabel-accent" aria-hidden>
                      ●&nbsp;
                    </span>
                    {OPP_STAGE_LABEL[stage]}
                  </span>
                  <button
                    className="nicon"
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(stage)) next.delete(stage);
                        else next.add(stage);
                        return next;
                      })
                    }
                    aria-label={isCollapsed ? "展开" : "折叠"}
                  >
                    {isCollapsed ? "＋" : "−"}
                  </button>
                </header>
                <div className="nlabel" style={{ padding: "0 14px 6px" }}>
                  {list.length} 个 · {fmtMoney(stageTotal(list))}
                </div>
                {!isCollapsed && (
                  <div
                    className="ncard-body"
                    style={{
                      gap: 8,
                      overflow: "auto",
                      maxHeight: "calc(100dvh - 280px)",
                    }}
                  >
                    {list.map((o) => {
                      const stale = isStale(o);
                      const days = staleDays(o);
                      const activeDays = days !== null ? Math.max(0, days) : null;
                      return (
                      <div
                        key={o.id}
                        className={`n-pop crm-click ${stale ? "crm-stale" : ""}`}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          background: "var(--n-card2)",
                          border: "1px solid var(--n-border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--n-text)",
                              fontWeight: 600,
                              wordBreak: "break-word",
                            }}
                          >
                            {o.title}
                          </span>
                          {isAdmin && (
                            <button className="nicon" onClick={() => setEditingOpp(o)}>
                              ✎
                            </button>
                          )}
                        </div>
                        <div className="nlabel" style={{ color: "var(--n-faint)" }}>
                          {accountMap.get(o.accountId) ?? `客户#${o.accountId}`}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span className="font-dot" style={{ fontSize: 13 }}>
                            {fmtMoney(Number(o.amountCny ?? 0))}
                          </span>
                          {o.expectedClose && (
                            <span className="nlabel" style={{ color: "var(--n-dim)" }}>
                              预计 {o.expectedClose}
                            </span>
                          )}
                        </div>
                        {o.nextActionDue && (
                          <div
                            style={{
                              fontSize: 10,
                              color: o.nextActionDue < todayStr() ? "var(--n-accent)" : "var(--n-dim)",
                            }}
                          >
                            下次动作：{o.nextActionDue} {o.nextAction ? `· ${o.nextAction}` : ""}
                          </div>
                        )}
                        <div className="nlabel" style={{ color: "var(--n-dim)" }}>
                          验证物 {validationCount(o)}/6
                        </div>
                        {stale ? (
                          <div className="nlabel nlabel-accent">
                            滞留 {days} 天
                          </div>
                        ) : activeDays !== null && activeDays < 1 ? (
                          <div className="nlabel" style={{ color: "var(--n-dim)" }}>
                            {activeDays} 天内活跃
                          </div>
                        ) : null}
                        {isAdmin && (
                          <select
                            className="nselect"
                            value={o.stage}
                            onChange={(e) => moveStage(o, e.target.value)}
                            style={{ width: "100%" }}
                            aria-label="移阶段"
                          >
                            <option value="" disabled>
                              移阶段…
                            </option>
                            {OPP_STAGE_ORDER.map((s) => (
                              <option key={s} value={s}>
                                {OPP_STAGE_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                  {list.length === 0 && (
                    <div className="nlabel" style={{ textAlign: "center", padding: "18px 0" }}>
                      暂无商机 · 点＋新建
                    </div>
                  )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editingOpp && (
        <OppEditModal
          opp={editingOpp}
          onClose={() => setEditingOpp(null)}
          onSave={(patch) => updateOpp.mutate({ id: editingOpp.id, patch })}
        />
      )}
    </div>
  );
}

function OppEditModal({
  opp,
  onClose,
  onSave,
}: {
  opp: Opportunity;
  onClose: () => void;
  onSave: (patch: {
    amountCny?: number | null;
    expectedClose?: string | null;
    nextAction?: string | null;
    nextActionDue?: string | null;
  }) => void;
}) {
  const [amount, setAmount] = useState(String(opp.amountCny ?? ""));
  const [expectedClose, setExpectedClose] = useState(opp.expectedClose ?? "");
  const [nextAction, setNextAction] = useState(opp.nextAction ?? "");
  const [nextActionDue, setNextActionDue] = useState(opp.nextActionDue ?? "");

  const save = () => {
    onSave({
      amountCny: amount ? Number(amount) : null,
      expectedClose: expectedClose || null,
      nextAction: nextAction || null,
      nextActionDue: nextActionDue || null,
    });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="ncard"
        style={{ width: "min(420px, 92vw)", padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ncard-head">
          <span className="nlabel">编辑商机</span>
          <button className="nicon" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="ncard-body" style={{ gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="nlabel">金额</span>
            <input
              className="ninput"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="nlabel">预计成交日</span>
            <input
              className="ninput"
              type="date"
              value={expectedClose}
              onChange={(e) => setExpectedClose(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="nlabel">下次动作</span>
            <input
              className="ninput"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="动作内容"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="nlabel">下次动作截止</span>
            <input
              className="ninput"
              type="date"
              value={nextActionDue}
              onChange={(e) => setNextActionDue(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className="nbtn" onClick={onClose}>
              取消
            </button>
            <button className="nbtn nbtn-accent" onClick={save}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
