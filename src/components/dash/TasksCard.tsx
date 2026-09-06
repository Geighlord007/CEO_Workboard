import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { diffDays, thisMondayStr, nextMondayStr, todayStr } from "@/lib/dates";
import { PRIORITY_LABEL, TRACK_KEYS, TRACK_META, type TrackKey } from "@contracts/dash";

/** 本周任务：按业务线分组，支持新增/删除/勾选完成；可切到下周计划 */
export function TasksCard({ compact }: { compact: boolean }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"cur" | "next">("cur");
  const weekOf = tab === "cur" ? thisMondayStr() : nextMondayStr();

  const { data: tasks } = trpc.task.listWeek.useQuery({ weekOf });
  const invalidate = () => {
    utils.task.listWeek.invalidate();
    utils.task.counts.invalidate();
  };
  const toggle = trpc.task.toggle.useMutation({ onSuccess: invalidate });
  const create = trpc.task.create.useMutation({ onSuccess: invalidate });
  const update = trpc.task.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.task.remove.useMutation({ onSuccess: invalidate });

  // 新增表单状态
  const [title, setTitle] = useState("");
  const [track, setTrack] = useState<TrackKey>("bd");
  const [priority, setPriority] = useState(1);
  const [due, setDue] = useState("");

  // 编辑状态
  const [editing, setEditing] = useState<null | {
    id: number;
    title: string;
    track: TrackKey;
    priority: number;
    dueDate: string;
  }>(null);

  const startEdit = (t: {
    id: number;
    title: string;
    track: string;
    priority: number;
    dueDate: string | null;
  }) =>
    setEditing({
      id: t.id,
      title: t.title,
      track: t.track as TrackKey,
      priority: t.priority,
      dueDate: t.dueDate ?? "",
    });

  const saveEdit = () => {
    if (!editing || !editing.title.trim()) return;
    update.mutate({
      id: editing.id,
      title: editing.title.trim(),
      track: editing.track,
      priority: editing.priority,
      dueDate: editing.dueDate || null,
    });
    setEditing(null);
  };

  const submit = () => {
    const v = title.trim();
    if (!v || create.isPending) return;
    create.mutate({ title: v, track, priority, dueDate: due || null, weekOf });
    setTitle("");
    setDue("");
  };

  const today = todayStr();

  return (
    <>
      {/* 周切换 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flex: "none" }}>
        {(["cur", "next"] as const).map((k) => (
          <button
            key={k}
            className="nbtn"
            style={tab === k ? { color: "var(--n-text)", borderColor: "var(--n-text)" } : {}}
            onClick={() => setTab(k)}
          >
            {k === "cur" ? "本周" : "下周"}
          </button>
        ))}
        <span className="nlabel" style={{ marginLeft: "auto", alignSelf: "center" }}>
          {(tasks ?? []).filter((t) => t.done).length}/{(tasks ?? []).length} 完成
        </span>
      </div>

      <div className="ndim-list" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {TRACK_KEYS.map((tk) => {
          const list = (tasks ?? []).filter((t) => t.track === tk);
          if (list.length === 0) return null;
          const doneN = list.filter((t) => t.done).length;
          return (
            <div key={tk} style={{ marginBottom: 6 }}>
              <div className="nlabel" style={{ padding: "4px 0 3px", borderBottom: "1px solid var(--n-border-soft)" }}>
                [{TRACK_META[tk].short}] {TRACK_META[tk].label}
                <span style={{ float: "right", letterSpacing: "0.1em" }}>{doneN}/{list.length}</span>
              </div>
              {list.map((t) => {
                const overdue = !t.done && t.dueDate != null && t.dueDate < today;
                if (editing?.id === t.id) {
                  return (
                    <div key={t.id} style={{ padding: "6px 0", borderBottom: "1px dashed var(--n-border-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
                      <input
                        className="ninput"
                        autoFocus
                        value={editing.title}
                        onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        maxLength={200}
                        placeholder="任务标题"
                      />
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <select className="nselect" value={editing.track} onChange={(e) => setEditing({ ...editing, track: e.target.value as TrackKey })}>
                          {TRACK_KEYS.map((k) => (
                            <option key={k} value={k}>{TRACK_META[k].short}</option>
                          ))}
                        </select>
                        <button
                          className="nbtn"
                          style={editing.priority === 0 ? { color: "var(--n-accent)", borderColor: "var(--n-accent)" } : {}}
                          onClick={() => setEditing({ ...editing, priority: (editing.priority + 1) % 3 })}
                        >
                          {PRIORITY_LABEL[editing.priority]}
                        </button>
                        <input className="ninput" type="date" value={editing.dueDate} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })} aria-label="截止日期" />
                        <button className="nbtn nbtn-accent" onClick={saveEdit} disabled={update.isPending}>保存</button>
                        <button className="nbtn" onClick={() => setEditing(null)}>取消</button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", borderBottom: "1px dashed var(--n-border-soft)" }}>
                    {/* 自定义方形勾选框 */}
                    <button
                      onClick={() => toggle.mutate({ id: t.id, done: !t.done, day: today })}
                      aria-label={t.done ? "标记未完成" : "标记完成"}
                      style={{
                        width: 13, height: 13, flex: "none", cursor: "pointer",
                        border: `1px solid ${t.done ? "var(--n-accent)" : "var(--n-dim)"}`,
                        borderRadius: 2,
                        background: t.done ? "var(--n-accent)" : "transparent",
                        display: "grid", placeItems: "center", padding: 0,
                      }}
                    >
                      {t.done && <i style={{ width: 5, height: 5, background: "#fff", borderRadius: 1 }} />}
                    </button>
                    <span
                      style={{
                        flex: 1, fontSize: 11, lineHeight: 1.5, minWidth: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        color: t.done ? "var(--n-faint)" : "var(--n-text)",
                        textDecoration: t.done ? "line-through" : "none",
                      }}
                      title={t.title}
                    >
                      {t.title}
                    </span>
                    {t.link && (
                      <a className="nicon" href={t.link} target="_blank" rel="noreferrer" title="打开关联文档" style={{ textDecoration: "none" }}>
                        ↗
                      </a>
                    )}
                    <span
                      className="font-dot"
                      style={{
                        fontSize: 9, flex: "none", letterSpacing: "0.08em",
                        color: t.priority === 0 ? "var(--n-accent)" : "var(--n-dim)",
                      }}
                    >
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                    {t.dueDate && (
                      <span style={{ fontSize: 9, flex: "none", color: overdue ? "var(--n-accent)" : "var(--n-faint)", letterSpacing: "0.05em" }}>
                        {overdue ? `超期 ${diffDays(t.dueDate, today)}d` : t.dueDate === today ? "今天" : t.dueDate.slice(5).replace("-", ".")}
                      </span>
                    )}
                    <button className="nicon" onClick={() => startEdit(t)} aria-label="编辑任务" title="编辑标题/截止日期">✎</button>
                    <button className="nicon" onClick={() => remove.mutate({ id: t.id })} aria-label="删除任务">×</button>
                  </div>
                );
              })}
            </div>
          );
        })}
        {(tasks ?? []).length === 0 && (
          <div className="nlabel" style={{ textAlign: "center", padding: "24px 0" }}>
            — {tab === "cur" ? "本周" : "下周"}暂无任务 —
          </div>
        )}
      </div>

      {/* 新增任务 */}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flex: "none", flexWrap: compact ? "wrap" : undefined }}>
        <input
          className="ninput"
          style={{ flex: 1, minWidth: 120 }}
          placeholder={`添加到${tab === "cur" ? "本周" : "下周"}，回车保存…`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          maxLength={200}
        />
        <select className="nselect" value={track} onChange={(e) => setTrack(e.target.value as TrackKey)} aria-label="业务线">
          {TRACK_KEYS.map((k) => (
            <option key={k} value={k}>{TRACK_META[k].short}</option>
          ))}
        </select>
        <button
          className="nbtn"
          style={priority === 0 ? { color: "var(--n-accent)", borderColor: "var(--n-accent)" } : {}}
          onClick={() => setPriority((priority + 1) % 3)}
          title="点击切换优先级"
        >
          {PRIORITY_LABEL[priority]}
        </button>
        <input className="ninput" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: 118 }} aria-label="截止日期" />
        <button className="nbtn nbtn-accent" onClick={submit} disabled={create.isPending}>＋</button>
      </div>
    </>
  );
}
