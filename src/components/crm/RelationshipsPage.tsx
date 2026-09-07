import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  REL_TYPES,
  REL_TYPE_META,
  STAGE_LABELS,
  STAGE_FLOW,
  type RelationshipType,
} from "@contracts/crm";

/** 统一「关系」列表：客户/顾问/合作方 + 供应商 + 投资人，按类型筛选 + 进行中/历史切换 */
export function RelationshipsPage({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data: items } = trpc.crm.relationship.list.useQuery();
  const create = trpc.crm.relationship.create.useMutation({
    onSuccess: () => utils.crm.relationship.list.invalidate(),
  });
  const setStage = trpc.crm.relationship.setStage.useMutation({
    onSuccess: () => utils.crm.relationship.list.invalidate(),
  });

  const [typeFilter, setTypeFilter] = useState<RelationshipType | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [newType, setNewType] = useState<RelationshipType>("client");
  const [newName, setNewName] = useState("");

  const filtered = useMemo(() => {
    let rows = items ?? [];
    if (typeFilter !== "all") rows = rows.filter((r) => r.type === typeFilter);
    if (!showArchived) rows = rows.filter((r) => !r.isArchived);
    return rows;
  }, [items, typeFilter, showArchived]);

  type Row = (typeof filtered)[number];

  const advance = (r: Row) => {
    const flow = STAGE_FLOW[r.type];
    const next = flow.stages[flow.stages.indexOf(r.stage) + 1];
    if (next) setStage.mutate({ type: r.type, id: r.id, stage: next });
  };
  const back = (r: Row) => {
    const flow = STAGE_FLOW[r.type];
    const idx = flow.stages.indexOf(r.stage);
    if (idx > 0) setStage.mutate({ type: r.type, id: r.id, stage: flow.stages[idx - 1] });
  };
  const archive = (r: Row) =>
    setStage.mutate({ type: r.type, id: r.id, stage: STAGE_FLOW[r.type].terminal[0] });
  /** 恢复 = 回到最后一个进行中阶段（而不是从头开始） */
  const restore = (r: Row) => {
    const flow = STAGE_FLOW[r.type];
    setStage.mutate({ type: r.type, id: r.id, stage: flow.stages[flow.stages.length - 1] });
  };

  const submitCreate = () => {
    if (!newName.trim() || create.isPending) return;
    create.mutate({ type: newType, name: newName.trim() });
    setNewName("");
  };

  return (
    <div>
      {/* 工具行：进行中/历史开关 + 类型 chips */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <button
          className="nbtn"
          style={!showArchived ? { color: "var(--n-text)", borderColor: "var(--n-text)" } : undefined}
          onClick={() => setShowArchived(false)}
        >
          ● 进行中
        </button>
        <button
          className="nbtn"
          style={showArchived ? { color: "var(--n-text)", borderColor: "var(--n-text)" } : undefined}
          onClick={() => setShowArchived(true)}
        >
          全部·含历史
        </button>
        <span style={{ width: 1, height: 16, background: "var(--n-border)" }} />
        <button
          className="nbtn"
          style={typeFilter === "all" ? { color: "var(--n-text)", borderColor: "var(--n-text)" } : undefined}
          onClick={() => setTypeFilter("all")}
        >
          全部
        </button>
        {REL_TYPES.map((t) => (
          <button
            key={t}
            className="nbtn"
            style={typeFilter === t ? { color: "var(--n-text)", borderColor: "var(--n-text)" } : undefined}
            onClick={() => setTypeFilter(t)}
          >
            {REL_TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* 新增（仅总助可写） */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <select
            className="nselect"
            value={newType}
            onChange={(e) => setNewType(e.target.value as RelationshipType)}
            aria-label="关系类型"
          >
            {REL_TYPES.map((t) => (
              <option key={t} value={t}>{REL_TYPE_META[t].label}</option>
            ))}
          </select>
          <input
            className="ninput"
            style={{ flex: 1, minWidth: 160 }}
            placeholder="新增名称…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCreate()}
            maxLength={200}
          />
          <button className="nbtn nbtn-accent" onClick={submitCreate} disabled={create.isPending}>
            ＋
          </button>
        </div>
      )}

      {/* 关系列表 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.length === 0 && (
          <div className="nlabel" style={{ textAlign: "center", padding: "40px 0", color: "var(--n-faint)" }}>
            —— 当前无{showArchived ? "" : "进行中的"}关系 ——
          </div>
        )}
        {filtered.map((r) => {
          const meta = REL_TYPE_META[r.type];
          const label = STAGE_LABELS[r.type][r.stage] ?? r.stage;
          const idx = STAGE_FLOW[r.type].stages.indexOf(r.stage);
          const total = STAGE_FLOW[r.type].stages.length;
          return (
            <div
              key={`${r.type}-${r.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 8px",
                borderBottom: "1px dashed var(--n-border-soft)",
                opacity: r.isArchived ? 0.45 : 1,
              }}
            >
              <span className="nlabel" style={{ flex: "none", width: 20, color: r.isArchived ? "var(--n-faint)" : "var(--n-accent)" }}>
                {meta.short}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.name}
                {r.sub && <span style={{ color: "var(--n-faint)", fontSize: 10 }}> · {r.sub}</span>}
              </span>
              <span className="nlabel" style={{ flex: "none", fontSize: 10 }}>
                {r.isArchived ? `🔴 ${label}` : `${label} · ${idx + 1}/${total}`}
              </span>
              {isAdmin && (
                <span style={{ flex: "none", display: "flex", gap: 4 }}>
                  {!r.isArchived && idx > 0 && (
                    <button className="nicon" title="回到上一阶段" onClick={() => back(r)}>◀</button>
                  )}
                  {!r.isArchived && idx < total - 1 && (
                    <button className="nicon" title="推进到下一阶段" onClick={() => advance(r)}>▶</button>
                  )}
                  {!r.isArchived && (
                    <button className="nicon" title="归档（结束）" onClick={() => archive(r)}>○</button>
                  )}
                  {r.isArchived && (
                    <button className="nicon" title="恢复为进行中" onClick={() => restore(r)}>↩</button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
