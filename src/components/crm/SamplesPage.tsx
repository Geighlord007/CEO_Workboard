import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { SAMPLE_STATUS, SAMPLE_STATUS_LABEL, SAMPLE_STATUS_COLOR } from "./crmMeta";
import type { Sample, Account, Opportunity } from "./types";

const FINAL_STATUSES = new Set<Sample["status"]>(["passed", "failed"]);
const FEEDBACK_STATUSES = new Set<Sample["status"]>(["testing", "retest"]);

export function SamplesPage({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: samples, isLoading } = trpc.crm.sample.list.useQuery({});
  const { data: accounts } = trpc.crm.account.list.useQuery();
  const { data: opps } = trpc.crm.opportunity.list.useQuery({});

  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showNew, setShowNew] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newOppId, setNewOppId] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newSentAt, setNewSentAt] = useState("");
  const [newStatus, setNewStatus] = useState<Sample["status"]>("requested");

  const create = trpc.crm.sample.create.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const update = trpc.crm.sample.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const remove = trpc.crm.sample.remove.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });

  const list = (samples ?? []) as Sample[];

  const accountMap = useMemo(() => {
    const map = new Map<number, string>();
    ((accounts ?? []) as Account[]).forEach((a) => map.set(a.id, a.name));
    return map;
  }, [accounts]);

  const oppMap = useMemo(() => {
    const map = new Map<number, string>();
    ((opps ?? []) as Opportunity[]).forEach((o) => map.set(o.id, o.title));
    return map;
  }, [opps]);

  const stats = useMemo(() => {
    const inTransit = list.filter((s) => !FINAL_STATUSES.has(s.status)).length;
    const pendingFeedback = list.filter((s) => FEEDBACK_STATUSES.has(s.status)).length;
    return { inTransit, pendingFeedback };
  }, [list]);

  const filtered = useMemo(() => {
    const t = filterText.trim().toLowerCase();
    return list.filter((s) => {
      const textOk = !t || s.title.toLowerCase().includes(t);
      const statusOk = !filterStatus || s.status === filterStatus;
      return textOk && statusOk;
    });
  }, [list, filterText, filterStatus]);

  const submitNew = () => {
    const title = newTitle.trim();
    if (!title) return;
    create.mutate({
      title,
      opportunityId: newOppId ? Number(newOppId) : null,
      accountId: newAccountId ? Number(newAccountId) : null,
      qtySpec: newQty || null,
      sentAt: newSentAt || null,
      status: newStatus,
    });
    setNewTitle("");
    setNewOppId("");
    setNewAccountId("");
    setNewQty("");
    setNewSentAt("");
    setNewStatus("requested");
    setShowNew(false);
  };

  const updateStatus = (s: Sample, status: Sample["status"]) => {
    update.mutate({ id: s.id, patch: { status } });
  };

  const updateFeedback = (s: Sample) => {
    const v = window.prompt("反馈摘要", s.feedback ?? "");
    if (v === null) return;
    update.mutate({ id: s.id, patch: { feedback: v || null } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        className="ncard"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12 }}
      >
        <input
          className="ninput"
          placeholder="按标题过滤…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <select
          className="nselect"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ width: 120 }}
          aria-label="状态"
        >
          <option value="">全部状态</option>
          {SAMPLE_STATUS.map((s) => (
            <option key={s} value={s}>
              {SAMPLE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="nlabel" style={{ color: "var(--n-faint)" }}>
          在途 {stats.inTransit}
        </span>
        <span className="nlabel" style={{ color: "var(--n-faint)" }}>
          待反馈 {stats.pendingFeedback}
        </span>
        {isAdmin && (
          <button className="nbtn nbtn-accent" onClick={() => setShowNew(true)} disabled={create.isPending}>
            ＋ 新建样品
          </button>
        )}
      </div>

      {showNew && (
        <div
          className="ncard"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12 }}
        >
          <input
            className="ninput"
            placeholder="标题 *"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ flex: 1, minWidth: 140 }}
          />
          <input
            className="ninput"
            type="number"
            placeholder="商机 ID"
            value={newOppId}
            onChange={(e) => setNewOppId(e.target.value)}
            style={{ width: 100 }}
          />
          <input
            className="ninput"
            type="number"
            placeholder="客户 ID"
            value={newAccountId}
            onChange={(e) => setNewAccountId(e.target.value)}
            style={{ width: 100 }}
          />
          <input
            className="ninput"
            placeholder="数量/规格"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            style={{ width: 120 }}
          />
          <input
            className="ninput"
            type="date"
            value={newSentAt}
            onChange={(e) => setNewSentAt(e.target.value)}
            style={{ width: 140 }}
          />
          <select
            className="nselect"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as Sample["status"])}
            style={{ width: 120 }}
            aria-label="状态"
          >
            {SAMPLE_STATUS.map((s) => (
              <option key={s} value={s}>
                {SAMPLE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button className="nbtn" onClick={() => setShowNew(false)}>
            取消
          </button>
          <button className="nbtn nbtn-accent" onClick={submitNew} disabled={create.isPending}>
            保存
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          加载中<span className="n-blink">●</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          没有匹配的样品
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((s) => (
            <div
              key={s.id}
              className="ncard"
              style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--n-text)", fontWeight: 600 }}>
                  #{s.id} {s.title}
                  <span className="nlabel" style={{ marginLeft: 8, color: "var(--n-faint)" }}>
                    {s.opportunityId ? (oppMap.get(s.opportunityId) ?? `商机#${s.opportunityId}`) : ""}
                    {s.opportunityId && s.accountId ? " · " : ""}
                    {s.accountId ? (accountMap.get(s.accountId) ?? `客户#${s.accountId}`) : ""}
                  </span>
                </span>
                <span
                  className="nlabel"
                  style={{
                    color: SAMPLE_STATUS_COLOR[s.status],
                    border: `1px solid ${SAMPLE_STATUS_COLOR[s.status]}`,
                    borderRadius: 999,
                    padding: "2px 10px",
                  }}
                >
                  {SAMPLE_STATUS_LABEL[s.status]}
                </span>
              </div>
              <div className="nlabel" style={{ color: "var(--n-faint)" }}>
                {s.opportunityId ? `商机 #${s.opportunityId}` : ""}
                {s.opportunityId && s.accountId ? " · " : ""}
                {s.accountId ? `客户 #${s.accountId}` : "未关联"}
                {s.sentAt ? ` · 寄出 ${s.sentAt}` : ""}
                {s.tracking ? ` · 物流 ${s.tracking}` : ""}
              </div>
              {s.feedback && (
                <div className="nlabel" style={{ color: "var(--n-text)", whiteSpace: "pre-wrap" }}>
                  反馈：{s.feedback.length > 80 ? `${s.feedback.slice(0, 80)}…` : s.feedback}
                </div>
              )}
              {s.followUpAt && (
                <div className="nlabel" style={{ color: "var(--n-dim)" }}>
                  跟进 {s.followUpAt}
                </div>
              )}
              {isAdmin && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select
                    className="nselect"
                    value={s.status}
                    onChange={(e) => updateStatus(s, e.target.value as Sample["status"])}
                    style={{ width: 120 }}
                    aria-label="状态"
                  >
                    {SAMPLE_STATUS.map((st) => (
                      <option key={st} value={st}>
                        {SAMPLE_STATUS_LABEL[st]}
                      </option>
                    ))}
                  </select>
                  <button className="nbtn" onClick={() => updateFeedback(s)}>
                    反馈
                  </button>
                  <button
                    className="nbtn nicon-danger"
                    onClick={() => {
                      if (window.confirm("确定删除该样品记录？")) {
                        remove.mutate({ id: s.id });
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
