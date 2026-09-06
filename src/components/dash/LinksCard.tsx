import { useState } from "react";
import { trpc } from "@/providers/trpc";

/** 快捷入口：Slack / Gmail / Drive 等一键跳转；悬停反色，可增删 */
export function LinksCard({ compact }: { compact: boolean }) {
  const utils = trpc.useUtils();
  const { data: links } = trpc.link.list.useQuery();
  const invalidate = () => utils.link.list.invalidate();
  const create = trpc.link.create.useMutation({ onSuccess: invalidate });
  const remove = trpc.link.remove.useMutation({ onSuccess: invalidate });

  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const submit = () => {
    const l = label.trim();
    let u = url.trim();
    if (!l || !u || create.isPending) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    create.mutate({ label: l, url: u });
    setLabel("");
    setUrl("");
  };

  return (
    <>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6, alignContent: "start" }}>
        {(links ?? []).map((l) => (
          <div key={l.id} style={{ position: "relative" }} className="link-tile">
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
                border: "1px solid var(--n-border)",
                borderRadius: 8,
                padding: compact ? "7px 9px" : "10px 10px",
                color: "var(--n-text)",
                textDecoration: "none",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                transition: "all 0.15s ease",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--n-text)";
                e.currentTarget.style.color = "var(--n-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--n-text)";
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.label}</span>
              <span aria-hidden>↗</span>
            </a>
            <button
              className="nicon link-del"
              style={{ position: "absolute", top: -6, right: -4, background: "var(--n-card)", border: "1px solid var(--n-border)", opacity: 0 }}
              onClick={() => remove.mutate({ id: l.id })}
              aria-label={`删除 ${l.label}`}
            >
              ×
            </button>
          </div>
        ))}
        <style>{`.link-tile:hover .link-del{opacity:1}`}</style>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flex: "none" }}>
        <input className="ninput" style={{ width: 76 }} placeholder="名称" value={label}
          onChange={(e) => setLabel(e.target.value)} maxLength={30} />
        <input className="ninput" style={{ flex: 1, minWidth: 80 }} placeholder="https://…" value={url}
          onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} maxLength={300} />
        <button className="nbtn" onClick={submit} disabled={create.isPending}>＋</button>
      </div>
    </>
  );
}
