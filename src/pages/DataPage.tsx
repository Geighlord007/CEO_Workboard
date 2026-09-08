import { useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";

type Col = {
  field: string;
  type: string;
  enumValues: string[] | null;
  editable: boolean;
  nullable: boolean;
  key: string;
  extra: string;
};

type Row = Record<string, unknown>;

/** 数据浏览（仅管理员）：左侧表清单 + 网格浏览；「编辑」只放行白名单字段 */
export default function DataPage() {
  const { user, isLoading, logout } = useAuth({ redirectOnUnauthenticated: true });
  const [theme, toggleTheme] = useTheme();
  const utils = trpc.useUtils();

  const tables = trpc.data.listTables.useQuery();
  const [table, setTable] = useState<string>("suppliers");

  const colsQ = trpc.data.showTable.useQuery({ table: table as never }, { enabled: !!table });
  const updateRow = trpc.data.updateRow.useMutation({
    onSuccess: () => utils.data.showTable.invalidate({ table: table as never }),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, string | number | boolean | null>>({});
  const [err, setErr] = useState("");

  const columns = useMemo(() => (colsQ.data?.columns ?? []) as Col[], [colsQ.data]);
  const rows = useMemo(() => (colsQ.data?.rows ?? []) as Row[], [colsQ.data]);
  const editableFields = useMemo(
    () => columns.filter((c) => c.editable).map((c) => c.field),
    [columns],
  );

  const isAdmin = user?.role === "admin";
  const fmt = (c: Col, v: unknown) => {
    if (v === null || v === undefined) return <span style={{ color: "var(--n-faint)" }}>∅</span>;
    if (c.type === "bool") return v ? "✓" : "✕";
    return String(v);
  };

  const startEdit = (r: Row) => {
    const id = Number(r.id);
    const d: Record<string, string | number | boolean | null> = {};
    columns.forEach((c) => {
      if (c.editable) {
        const v = r[c.field];
        d[c.field] = (v ?? null) as string | number | boolean | null;
      }
    });
    setEditingId(id);
    setDraft(d);
    setErr("");
  };

  const save = async () => {
    if (editingId === null) return;
    const patch: Record<string, string | number | boolean | null> = {};
    for (const f of editableFields) {
      const col = columns.find((c) => c.field === f);
      let v: unknown = draft[f];
      if (col?.type === "bool") {
        patch[f] = !!v;
        continue;
      }
      if (v === "" || v === null || v === undefined) {
        patch[f] = null;
        continue;
      }
      if (col?.type === "int" || col?.type === "decimal") {
        const n = Number(v);
        patch[f] = Number.isNaN(n) ? null : n;
        continue;
      }
      patch[f] = String(v);
    }
    updateRow.mutate(
      { table: table as never, id: editingId, patch },
      {
        onSuccess: (r2) => {
          if (r2.updated > 0) setEditingId(null);
        },
        onError: (e) => setErr(e.message),
      },
    );
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div className="nlabel">LOADING<span className="n-blink">●</span></div>
      </div>
    );
  }
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="font-dot nx-brand" style={{ fontSize: 22 }}>WTC</div>
          <div className="nlabel" style={{ marginTop: 10 }}>数据页仅总助(admin)可用</div>
          <Link to="/" className="nbtn" style={{ marginTop: 14, textDecoration: "none" }}>← 返回看板</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh" }}>
      <div style={{ maxWidth: 1560, margin: "0 auto", padding: "12px 16px 40px" }}>
        {/* 顶栏 */}
        <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingBottom: 10 }}>
          <span className="font-dot nx-brand" style={{ fontSize: 16 }}>WTC·数据</span>
          <Link to="/" className="nbtn" style={{ textDecoration: "none" }}>← 返回看板</Link>
          <span className="nlabel" style={{ color: "var(--n-faint)" }}>只读浏览 · 编辑仅白名单字段 · {colsQ.data?.total ?? "…"} 行</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button className="nbtn" onClick={toggleTheme}>{theme === "dark" ? "DARK" : "LIGHT"}</button>
            <span className="nlabel" style={{ color: "var(--n-faint)" }}>{user.name}</span>
            <button className="nbtn" onClick={logout}>退出</button>
          </span>
        </header>

        {/* 表清单 */}
        <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {(tables.data ?? []).map((t) => (
            <button
              key={t.name}
              className="nbtn"
              onClick={() => {
                setTable(t.name);
                setEditingId(null);
              }}
              style={table === t.name ? { color: "var(--n-text)", borderColor: "#818cf8", boxShadow: "0 0 12px -6px rgba(129,140,248,.9)" } : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* 网格 */}
        <div className="ncard" style={{ padding: 0, overflow: "auto", maxHeight: "calc(100dvh - 190px)" }}>
          {!colsQ.data ? (
            <div className="nlabel" style={{ padding: 24 }}>加载中<span className="n-blink">●</span></div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%", fontSize: 11 }}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.field}
                      style={{
                        position: "sticky", top: 0, zIndex: 2,
                        background: "var(--n-card2)", textAlign: "left",
                        padding: "6px 8px", borderBottom: "1px solid var(--n-border)",
                        fontSize: 10, color: c.editable ? "var(--nx-c2)" : "var(--n-dim)", whiteSpace: "nowrap",
                      }}
                    >
                      {c.field}
                    </th>
                  ))}
                  <th style={{ position: "sticky", top: 0, background: "var(--n-card2)", borderBottom: "1px solid var(--n-border)" }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const id = Number(r.id);
                  const isEditing = editingId === id;
                  return (
                    <tr key={id} style={{ borderBottom: "1px dashed var(--n-border-soft)" }}>
                      {columns.map((c) => {
                        const val = isEditing ? (draft[c.field] ?? "") : r[c.field];
                        return (
                          <td key={c.field} style={{ padding: "3px 8px", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "top" }}>
                            {isEditing && c.editable ? (
                              c.type === "bool" ? (
                                <input
                                  type="checkbox"
                                  checked={!!val}
                                  onChange={(e) => setDraft((d) => ({ ...d, [c.field]: e.target.checked }))}
                                />
                              ) : c.type === "enum" && c.enumValues ? (
                                <select
                                  className="nselect"
                                  value={String(val ?? "")}
                                  onChange={(e) => setDraft((d) => ({ ...d, [c.field]: e.target.value }))}
                                >
                                  <option value="">∅</option>
                                  {c.enumValues.map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  className="ninput"
                                  type={c.type === "int" || c.type === "decimal" ? "number" : "text"}
                                  style={{ width: "100%", minWidth: 120 }}
                                  value={String(val ?? "")}
                                  onChange={(e) => setDraft((d) => ({ ...d, [c.field]: e.target.value }))}
                                />
                              )
                            ) : (
                              fmt(c, r[c.field])
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: "3px 8px", whiteSpace: "nowrap" }}>
                        {isEditing ? (
                          <span style={{ display: "flex", gap: 4 }}>
                            <button className="nbtn" onClick={save} disabled={updateRow.isPending}>
                              {updateRow.isPending ? "保存中" : "保存"}
                            </button>
                            <button className="nicon" onClick={() => setEditingId(null)}>×</button>
                          </span>
                        ) : (
                          <button className="nicon" title="编辑本行（白名单字段）" onClick={() => startEdit(r)}>
                            ✎
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {err && <div className="nlabel nlabel-accent" style={{ marginTop: 8 }}>保存失败：{err}</div>}
        <div className="nlabel" style={{ marginTop: 8, color: "var(--n-faint)" }}>
          提示：只有青色列可编辑；空值保存为 ∅（null）；保存后页面其它地方会同步。敏感表（账号/设置）未开放。
        </div>
      </div>
    </div>
  );
}
