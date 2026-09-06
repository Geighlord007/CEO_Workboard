import { useState } from "react";
import { trpc } from "@/providers/trpc";

/** 备忘便签：新增 / 删除，云端保存 */
export function NotesCard() {
  const utils = trpc.useUtils();
  const { data: notes } = trpc.note.list.useQuery();
  const create = trpc.note.create.useMutation({
    onSuccess: () => utils.note.list.invalidate(),
  });
  const remove = trpc.note.remove.useMutation({
    onSuccess: () => utils.note.list.invalidate(),
  });

  const [text, setText] = useState("");
  const submit = () => {
    const v = text.trim();
    if (!v || create.isPending) return;
    create.mutate({ content: v });
    setText("");
  };

  return (
    <>
      <div className="ndim-list" style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {(notes ?? []).length === 0 && (
          <div className="nlabel" style={{ margin: "auto" }}>— 暂无便签 —</div>
        )}
        {(notes ?? []).map((n, i) => (
          <div
            key={n.id}
            style={{ display: "flex", gap: 8, padding: "5px 2px", borderBottom: "1px dashed var(--n-border-soft)", alignItems: "baseline" }}
          >
            <span className="font-dot" style={{ color: "var(--n-faint)", fontSize: 10, flex: "none" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ flex: 1, fontSize: 11, lineHeight: 1.6, wordBreak: "break-all" }}>{n.content}</span>
            <button className="nicon" onClick={() => remove.mutate({ id: n.id })} aria-label="删除便签">
              ×
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flex: "none" }}>
        <input
          className="ninput"
          style={{ flex: 1 }}
          placeholder="记一笔，回车保存…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          maxLength={500}
        />
        <button className="nbtn" onClick={submit} disabled={create.isPending}>
          ＋
        </button>
      </div>
    </>
  );
}
