import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { todayStr, addDays, dayFmt } from "@/lib/dates";
import { ACTIVITY_KIND_LABEL, OPP_STAGE_LABEL, fmtMoney } from "./crmMeta";
import { CMD_ACTIVITY_KINDS } from "@contracts/commands";
import type { Opportunity } from "./types";

export function QueuePage({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: accounts } = trpc.crm.account.list.useQuery();
  const { data: opps, isLoading } = trpc.crm.opportunity.list.useQuery({});

  const updateOpp = trpc.crm.opportunity.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const createActivity = trpc.crm.activity.create.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });

  const [activeId, setActiveId] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<(typeof CMD_ACTIVITY_KINDS)[number]>("other");
  const [postponeDays, setPostponeDays] = useState(3);
  const [clearDue, setClearDue] = useState(false);
  const [justFinished, setJustFinished] = useState<Set<number>>(new Set());

  const accountMap = useMemo(() => {
    const map = new Map<number, string>();
    (accounts ?? []).forEach((a) => map.set(a.id, a.name));
    return map;
  }, [accounts]);

  const queue = useMemo(() => {
    const list = (opps ?? []) as Opportunity[];
    return list
      .filter((o) => o.stage !== "won" && o.stage !== "lost" && o.nextActionDue)
      .sort((a, b) => (a.nextActionDue ?? "").localeCompare(b.nextActionDue ?? ""));
  }, [opps]);

  const finish = (o: Opportunity) => {
    setJustFinished((prev) => new Set(prev).add(o.id));
    updateOpp.mutate({
      id: o.id,
      patch: { nextAction: null, nextActionDue: null },
    });
  };

  const logActivity = (o: Opportunity) => {
    const v = summary.trim();
    if (!v) return;
    createActivity.mutate({
      subjectType: "opportunity",
      subjectId: o.id,
      kind,
      summary: v,
      nextActionAt: clearDue
        ? null
        : dayFmt(addDays(new Date(), Math.max(1, postponeDays))),
    });
    updateOpp.mutate({
      id: o.id,
      patch: clearDue
        ? { nextAction: null, nextActionDue: null }
        : { nextActionDue: dayFmt(addDays(new Date(), Math.max(1, postponeDays))) },
    });
    setSummary("");
    setKind("other");
    setPostponeDays(3);
    setClearDue(false);
    setActiveId(null);
  };

  return (
    <div className="ncard">
      <header className="ncard-head">
        <span className="nlabel">
          <span className="nlabel-accent" aria-hidden>
            ●&nbsp;
          </span>
          待跟进队列
        </span>
        <span className="nlabel">{queue.length} 条</span>
      </header>
      <div className="ncard-body" style={{ gap: 8 }}>
        {isLoading ? (
          <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
            加载中<span className="n-blink">●</span>
          </div>
        ) : queue.length === 0 ? (
          <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
            暂无待跟进商机<br />
            <span style={{ color: "var(--n-faint)", fontSize: 11 }}>所有下次动作已清空，去“商机”页推进项目</span>
          </div>
        ) : (
          queue.map((o) => {
            const overdue = !!o.nextActionDue && o.nextActionDue < todayStr();
            return (
              <div
                key={o.id}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: "var(--n-card2)",
                  border: `1px solid ${overdue ? "var(--n-accent)" : "var(--n-border-soft)"}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 140, fontSize: 12, color: "var(--n-text)" }}>
                    {o.title}
                  </span>
                  <span className="nlabel">
                    {accountMap.get(o.accountId) ?? `客户#${o.accountId}`}
                  </span>
                  <span className="nlabel">{OPP_STAGE_LABEL[o.stage] ?? o.stage}</span>
                  <span className="font-dot" style={{ fontSize: 12 }}>
                    {fmtMoney(Number(o.amountCny ?? 0))}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: overdue ? "var(--n-accent)" : "var(--n-dim)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    截止 {o.nextActionDue} {overdue ? "· 已超期" : ""}
                  </span>
                  {o.nextAction && (
                    <span className="nlabel" style={{ color: "var(--n-faint)" }}>
                      {o.nextAction}
                    </span>
                  )}
                  {isAdmin && (
                    <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        className="nbtn"
                        onClick={() => finish(o)}
                        disabled={justFinished.has(o.id)}
                        style={
                          justFinished.has(o.id)
                            ? {
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                color: "var(--n-faint)",
                                borderColor: "var(--n-border)",
                                background: "var(--n-card2)",
                                cursor: "default",
                              }
                            : { display: "inline-flex", alignItems: "center", gap: 6 }
                        }
                      >
                        {justFinished.has(o.id) ? (
                          <>
                            已跟进
                            <span style={{ fontSize: 10 }}>✓</span>
                          </>
                        ) : (
                          <>
                            <span
                              style={{
                                width: 12,
                                height: 12,
                                border: "1px solid currentColor",
                                borderRadius: 3,
                                display: "inline-block",
                              }}
                            />
                            标记完成
                          </>
                        )}
                      </button>
                      <button
                        className="nbtn nbtn-accent"
                        onClick={() => setActiveId(activeId === o.id ? null : o.id)}
                      >
                        记一笔
                      </button>
                    </span>
                  )}
                </div>

                {activeId === o.id && isAdmin && (
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <select
                      className="nselect"
                      value={kind}
                      onChange={(e) => setKind(e.target.value as (typeof CMD_ACTIVITY_KINDS)[number])}
                      style={{ width: 100 }}
                      aria-label="跟进方式"
                    >
                      {CMD_ACTIVITY_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {ACTIVITY_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="ninput"
                      placeholder="跟进摘要…"
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && logActivity(o)}
                      style={{ flex: 1, minWidth: 160 }}
                    />
                    <input
                      className="ninput"
                      type="number"
                      min={1}
                      value={postponeDays}
                      onChange={(e) => setPostponeDays(Number(e.target.value))}
                      disabled={clearDue}
                      style={{ width: 70 }}
                      aria-label="顺延天数"
                    />
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        color: "var(--n-dim)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={clearDue}
                        onChange={(e) => setClearDue(e.target.checked)}
                      />
                      清空下次
                    </label>
                    <button className="nbtn" onClick={() => setActiveId(null)}>
                      取消
                    </button>
                    <button className="nbtn nbtn-accent" onClick={() => logActivity(o)}>
                      保存
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
