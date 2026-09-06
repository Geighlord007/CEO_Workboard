import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { dayFmt, todayStr } from "@/lib/dates";
import {
  ACCOUNT_KIND_LABEL,
  ACCOUNT_SOURCE_LABEL,
  ACCOUNT_STAGE_LABEL,
  ACTIVITY_KIND_LABEL,
  CONTACT_ROLE_LABEL,
  OPP_STAGE_LABEL,
  OPP_STAGE_ORDER,
  labelOf,
  fmtMoney,
} from "./crmMeta";
import { CMD_ACCOUNT_KINDS as ACCOUNT_KINDS, CMD_CONTACT_ROLES as CONTACT_ROLES } from "@contracts/commands";
import type { Account, Contact, Opportunity } from "./types";

export function CustomersPage({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: accounts, isLoading } = trpc.crm.account.list.useQuery();
  const { data: allOpps } = trpc.crm.opportunity.list.useQuery({});

  const [filterName, setFilterName] = useState("");
  const [filterKind, setFilterKind] = useState<string>("");

  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<(typeof ACCOUNT_KINDS)[number]>("company");
  const [newIndustry, setNewIndustry] = useState("");
  const [newSource, setNewSource] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const createAccount = trpc.crm.account.create.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });

  const filtered = useMemo(() => {
    const list = (accounts ?? []) as Account[];
    return list.filter((a) => {
      const nameOk = !filterName || a.name.toLowerCase().includes(filterName.toLowerCase());
      const kindOk = !filterKind || a.kind === filterKind;
      return nameOk && kindOk;
    });
  }, [accounts, filterName, filterKind]);

  const submitNewAccount = () => {
    const v = newName.trim();
    if (!v) return;
    createAccount.mutate({
      name: v,
      kind: newKind,
      industry: newIndustry || null,
      source: newSource || null,
    });
    setNewName("");
    setNewIndustry("");
    setNewSource("");
    setNewKind("company");
  };

  const selected = selectedId ? ((accounts ?? []) as Account[]).find((a) => a.id === selectedId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 过滤 + 新建 */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          className="ninput"
          placeholder="按名称过滤…"
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <select
          className="nselect"
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value)}
          style={{ width: 120 }}
          aria-label="类型"
        >
          <option value="">全部类型</option>
          {ACCOUNT_KINDS.map((k) => (
            <option key={k} value={k}>
              {ACCOUNT_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        {isAdmin && (
          <>
            <input
              className="ninput"
              placeholder="客户名称 *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNewAccount()}
              style={{ flex: 1, minWidth: 120 }}
            />
            <select
              className="nselect"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as (typeof ACCOUNT_KINDS)[number])}
              aria-label="客户类型"
            >
              {ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              className="ninput"
              placeholder="行业"
              value={newIndustry}
              onChange={(e) => setNewIndustry(e.target.value)}
              style={{ width: 100 }}
            />
            <input
              className="ninput"
              placeholder="来源"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              style={{ width: 100 }}
            />
            <button className="nbtn nbtn-accent" onClick={submitNewAccount} disabled={createAccount.isPending}>
              ＋ 新建客户
            </button>
          </>
        )}
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          加载中<span className="n-blink">●</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          没有匹配的客户
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 10,
          }}
        >
          {filtered.map((a) => (
            <button
              key={a.id}
              className="ncard crm-click"
              onClick={() => setSelectedId(a.id)}
              style={{
                textAlign: "left",
                background: "var(--n-card)",
                padding: 0,
              }}
            >
              <div className="ncard-head">
                <span style={{ fontSize: 13, color: "var(--n-text)" }}>{a.name}</span>
                <span className="nlabel">{labelOf(ACCOUNT_KIND_LABEL, a.kind)}</span>
              </div>
              <div className="ncard-body">
                <div className="nlabel" style={{ marginBottom: 4 }}>
                  {a.industry ?? "未设置"} · {labelOf(ACCOUNT_SOURCE_LABEL, a.source)}
                </div>
                <div className="nlabel" style={{ color: "var(--n-faint)" }}>
                  阶段：{labelOf(ACCOUNT_STAGE_LABEL, a.stage)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 详情侧栏 */}
      {selected && (
        <AccountDetail
          account={selected}
          allOpps={(allOpps ?? []) as Opportunity[]}
          onClose={() => setSelectedId(null)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function AccountDetail({
  account,
  allOpps,
  onClose,
  isAdmin,
}: {
  account: Account;
  allOpps: Opportunity[];
  onClose: () => void;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const { data: contacts } = trpc.crm.contact.listByAccount.useQuery(
    { accountId: account.id },
    { enabled: !!account }
  );
  const { data: activities } = trpc.crm.activity.list.useQuery(
    { subjectType: "account", subjectId: account.id },
    { enabled: !!account }
  );

  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState<(typeof CONTACT_ROLES)[number] | "">("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactWechat, setContactWechat] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<(typeof CONTACT_ROLES)[number] | "">("");
  const [editTitle, setEditTitle] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editWechat, setEditWechat] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const createContact = trpc.crm.contact.create.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const updateContact = trpc.crm.contact.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const removeContact = trpc.crm.contact.remove.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const updateOpp = trpc.crm.opportunity.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });

  const accountOpps = useMemo(
    () => allOpps.filter((o) => o.accountId === account.id),
    [allOpps, account.id]
  );

  const submitContact = () => {
    const v = contactName.trim();
    if (!v) return;
    createContact.mutate({
      accountId: account.id,
      name: v,
      roleInDeal: contactRole || null,
      title: contactTitle || null,
      email: contactEmail || null,
      wechat: contactWechat || null,
      phone: contactPhone || null,
    });
    setContactName("");
    setContactRole("");
    setContactTitle("");
    setContactEmail("");
    setContactWechat("");
    setContactPhone("");
  };

  const startEdit = (c: Contact) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditRole((c.roleInDeal as (typeof CONTACT_ROLES)[number]) ?? "");
    setEditTitle(c.title ?? "");
    setEditEmail(c.email ?? "");
    setEditWechat(c.wechat ?? "");
    setEditPhone(c.phone ?? "");
  };

  const saveEdit = (id: number) => {
    const v = editName.trim();
    if (!v) return;
    updateContact.mutate({
      id,
      patch: {
        name: v,
        roleInDeal: editRole || null,
        title: editTitle || null,
        email: editEmail || null,
        wechat: editWechat || null,
        phone: editPhone || null,
      },
    });
    setEditingId(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "start center",
        padding: "6vh 16px 16px",
      }}
      onClick={onClose}
    >
      <div
        className="ncard"
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "84vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ncard-head">
          <span style={{ fontSize: 14, color: "var(--n-text)" }}>{account.name}</span>
          <button className="nicon" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="ncard-body" style={{ gap: 16 }}>
          {/* 基本信息 */}
          <section>
            <div className="nlabel" style={{ marginBottom: 6 }}>
              基本信息
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 8,
                fontSize: 12,
              }}
            >
              <div>
                <span className="nlabel">类型</span> {labelOf(ACCOUNT_KIND_LABEL, account.kind)}
              </div>
              <div>
                <span className="nlabel">行业</span> {account.industry ?? "未设置"}
              </div>
              <div>
                <span className="nlabel">来源</span> {labelOf(ACCOUNT_SOURCE_LABEL, account.source)}
              </div>
              <div>
                <span className="nlabel">阶段</span> {labelOf(ACCOUNT_STAGE_LABEL, account.stage)}
              </div>
            </div>
          </section>

          {/* 联系人 */}
          <section>
            <div className="nlabel" style={{ marginBottom: 6 }}>
              联系人
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <input
                  className="ninput"
                  placeholder="姓名 *"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  style={{ flex: 1, minWidth: 80 }}
                />
                <select
                  className="nselect"
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value as (typeof CONTACT_ROLES)[number] | "")}
                  style={{ width: 110 }}
                  aria-label="角色"
                >
                  <option value="">角色</option>
                  {CONTACT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {CONTACT_ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <input
                  className="ninput"
                  placeholder="职位"
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  style={{ width: 90 }}
                />
                <input
                  className="ninput"
                  placeholder="邮箱"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  style={{ width: 120 }}
                />
                <input
                  className="ninput"
                  placeholder="微信"
                  value={contactWechat}
                  onChange={(e) => setContactWechat(e.target.value)}
                  style={{ width: 100 }}
                />
                <input
                  className="ninput"
                  placeholder="电话"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  style={{ width: 110 }}
                />
                <button
                  className="nbtn nbtn-accent"
                  onClick={submitContact}
                  disabled={createContact.isPending}
                >
                  ＋
                </button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {((contacts ?? []) as Contact[]).map((c) =>
                editingId === c.id ? (
                  <div key={c.id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input
                      className="ninput"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ flex: 1, minWidth: 80 }}
                    />
                    <select
                      className="nselect"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as (typeof CONTACT_ROLES)[number] | "")}
                      style={{ width: 110 }}
                    >
                      <option value="">角色</option>
                      {CONTACT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {CONTACT_ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="ninput"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      style={{ width: 90 }}
                    />
                    <input
                      className="ninput"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      style={{ width: 120 }}
                    />
                    <input
                      className="ninput"
                      value={editWechat}
                      onChange={(e) => setEditWechat(e.target.value)}
                      style={{ width: 100 }}
                    />
                    <input
                      className="ninput"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      style={{ width: 110 }}
                    />
                    <button className="nbtn" onClick={() => saveEdit(c.id)}>
                      保存
                    </button>
                    <button className="nbtn" onClick={() => setEditingId(null)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "var(--n-card2)",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--n-text)", minWidth: 60 }}>
                      {c.name}
                    </span>
                    <span className="nlabel">
                      {c.roleInDeal ? CONTACT_ROLE_LABEL[c.roleInDeal as (typeof CONTACT_ROLES)[number]] : "—"}
                    </span>
                    <span className="nlabel" style={{ color: "var(--n-faint)" }}>
                      {c.title ?? "—"}
                    </span>
                    <span className="nlabel" style={{ color: "var(--n-faint)" }}>
                      {c.email ?? c.wechat ?? c.phone ?? "—"}
                    </span>
                    {isAdmin && (
                      <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button className="nicon" onClick={() => startEdit(c)}>
                          ✎
                        </button>
                        <button
                          className="nicon nicon-danger"
                          onClick={() => {
                            if (window.confirm("确定删除该联系人？")) {
                              removeContact.mutate({ id: c.id });
                            }
                          }}
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                )
              )}
              {((contacts ?? []) as Contact[]).length === 0 && (
                <div className="nlabel" style={{ padding: "8px 0" }}>
                  暂无联系人
                </div>
              )}
            </div>
          </section>

          {/* 该客户商机 */}
          <section>
            <div className="nlabel" style={{ marginBottom: 6 }}>
              关联商机
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {accountOpps.map((o) => (
                <div
                  key={o.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: "var(--n-card2)",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--n-text)", flex: 1, minWidth: 120 }}>
                    {o.title}
                  </span>
                  <span className="nlabel">{OPP_STAGE_LABEL[o.stage] ?? o.stage}</span>
                  <span className="font-dot" style={{ fontSize: 12 }}>
                    {fmtMoney(Number(o.amountCny ?? 0))}
                  </span>
                  {o.nextActionDue && (
                    <span
                      style={{
                        fontSize: 10,
                        color: o.nextActionDue < todayStr() ? "var(--n-accent)" : "var(--n-dim)",
                      }}
                    >
                      下次 {o.nextActionDue}
                    </span>
                  )}
                  {isAdmin && (
                    <select
                      className="nselect"
                      value={o.stage}
                      onChange={(e) => {
                        const stage = e.target.value;
                        const lostReason = stage === "lost" ? window.prompt("输单原因") : undefined;
                        if (stage === "lost" && !lostReason) return;
                        const stageTyped = stage as (typeof OPP_STAGE_ORDER)[number];
                        updateOpp.mutate({
                          id: o.id,
                          patch: stage === "lost" ? { stage: stageTyped, lostReason: lostReason ?? undefined } : { stage: stageTyped },
                        });
                      }}
                      style={{ width: 110 }}
                    >
                      {OPP_STAGE_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {OPP_STAGE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              {accountOpps.length === 0 && (
                <div className="nlabel" style={{ padding: "8px 0" }}>
                  暂无商机
                </div>
              )}
            </div>
          </section>

          {/* 最近 Activity */}
          <section>
            <div className="nlabel" style={{ marginBottom: 6 }}>
              最近跟进
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {((activities ?? []) as { id: number; kind: string; summary: string; happenedAt: Date }[]).map((ac) => (
                <div
                  key={ac.id}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: "var(--n-card2)",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                    <span className="nlabel">
                      {ACTIVITY_KIND_LABEL[ac.kind as keyof typeof ACTIVITY_KIND_LABEL] ?? ac.kind}
                    </span>
                    <span className="nlabel" style={{ color: "var(--n-faint)" }}>
                      {dayFmt(new Date(ac.happenedAt))}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--n-text)", whiteSpace: "pre-wrap" }}>
                    {ac.summary}
                  </div>
                </div>
              ))}
              {((activities ?? []) as unknown[]).length === 0 && (
                <div className="nlabel" style={{ padding: "8px 0" }}>
                  暂无跟进记录
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
