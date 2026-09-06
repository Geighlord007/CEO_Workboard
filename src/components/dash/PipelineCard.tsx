import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { STAGE_FLOW, STAGE_LABELS, REL_TYPE_META } from "@contracts/crm";

type Row = { type: string; id: number; name: string; stage: string; isArchived: boolean };

/** 关系推进卡（客户 / 供应商）：与 CRM 关系列表同一份数据，可直接推进/归档/新增 */
export function PipelineCard({ relType }: { relType: "client" | "supplier" }) {
  const utils = trpc.useUtils();
  const { data: items } = trpc.crm.relationship.list.useQuery();
  const create = trpc.crm.relationship.create.useMutation({
    onSuccess: () => utils.crm.relationship.list.invalidate(),
  });
  const setStage = trpc.crm.relationship.setStage.useMutation({
    onSuccess: () => utils.crm.relationship.list.invalidate(),
  });

  const [newName, setNewName] = useState("");

  const flow = STAGE_FLOW[relType];
  const label = STAGE_LABELS[relType];
  const meta = REL_TYPE_META[relType];

  const rows = useMemo(
    () => (items ?? []).filter((r) => r.type === relType) as Row[],
    [items, relType],
  );
  const active = rows.filter((c) => !c.isArchived);
  const archived = rows.filter((c) => c.isArchived);

  const advance = (c: Row) => {
    const idx = flow.stages.indexOf(c.stage);
    const next = flow.stages[idx + 1];
    if (next) setStage.mutate({ type: relType, id: c.id, stage: next });
  };
  const archive = (c: Row) => setStage.mutate({ type: relType, id: c.id, stage: flow.terminal[0] });
  const restore = (c: Row) => setStage.mutate({ type: relType, id: c.id, stage: flow.stages[0] });

  const submitCreate = () => {
    if (!newName.trim() || create.isPending) return;
    create.mutate({ type: relType, name: newName.trim() });
    setNewName("");
  };

  return (
    <>
      {/* 阶段汇总 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "none" }}>
        {flow.stages.map((st, si) => {
          const list = active.filter((c) => c.stage === st);
          return (
            <div key={st} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="nlabel" style={{ width: 44, flex: "none", letterSpacing: "0.1em" }}>
                {label[st]}
              </span>
              <span style={{ display: "flex", gap: 2.5, flex: 1, overflow: "hidden" }}>
                {list.length === 0 && <i style={{ width: 7, height: 7, border: "1px dashed var(--n-border)", borderRadius: 1.5 }} />}
                {list.map((c) => (
                  <i
                    key={c.id}
                    style={{ width: 7, height: 7, flex: "none", borderRadius: 1.5, background: `color-mix(in srgb, var(--n-text) ${45 + si * 25}%, transparent)` }}
                  />
                ))}
              </span>
              <span className="font-dot" style={{ fontSize: 12, width: 18, textAlign: "right", color: list.length ? "var(--n-text)" : "var(--n-faint)" }}>
                {list.length}
              </span>
            </div>
          );
        })}
        <div style={{ fontSize: 9, color: "var(--n-faint)", paddingLeft: 44 }}>
          已归档 {archived.length}（{flow.terminal.map((t) => label[t]).join("/")}）
        </div>
      </div>

      {/* 条目列表（始终显示，可推进/归档/恢复） */}
      <div className="ndim-list" style={{ flex: 1, minHeight: 0, overflow: "auto", marginTop: 8, borderTop: "1px dashed var(--n-border)", paddingTop: 4 }}>
        {rows.length === 0 && (
          <div className="nlabel" style={{ color: "var(--n-faint)", textAlign: "center", padding: "10px 0" }}>
            — 暂无{meta.label} —
          </div>
        )}
        {active.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 10 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>
              {c.name}
            </span>
            <span className="nlabel" style={{ flex: "none", fontSize: 9 }}>{label[c.stage]}</span>
            <button className="nicon" title="推进到下一阶段" onClick={() => advance(c)}>▶</button>
            <button className="nicon" title="归档（结束）" onClick={() => archive(c)}>○</button>
          </div>
        ))}
        {archived.slice(0, 3).map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 10, opacity: 0.5 }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "line-through" }}>
              {c.name}
            </span>
            <span className="nlabel" style={{ flex: "none", fontSize: 9 }}>{label[c.stage]}</span>
            <button className="nicon" title="恢复为进行中" onClick={() => restore(c)}>↩</button>
          </div>
        ))}
      </div>

      {/* 新增 */}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flex: "none" }}>
        <input
          className="ninput"
          style={{ flex: 1, minWidth: 80 }}
          placeholder={`新增${meta.label}…`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitCreate()}
          maxLength={200}
        />
        <button className="nbtn nbtn-accent" onClick={submitCreate} disabled={create.isPending}>＋</button>
      </div>
    </>
  );
}
