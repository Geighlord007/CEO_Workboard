import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { todayStr } from "@/lib/dates";
import {
  RFQ_STATUS,
  RFQ_STATUS_LABEL,
  QUALITY_KIND,
  QUALITY_KIND_LABEL,
  DOC_KIND,
  DOC_KIND_LABEL,
  SUPPLIER_RISK_LABEL,
  SUPPLIER_RISK_COLOR,
  supplierCategoryLabel,
  fmtMoney,
} from "./crmMeta";
import type { Supplier, Rfq, QualityEvent, Doc } from "./types";

const RISK_OPTIONS = ["H", "M", "L"] as const;

export function SuppliersPage({ isAdmin }: { isAdmin: boolean }) {
  const [subTab, setSubTab] = useState<"profile" | "rfq" | "quality">("profile");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { key: "profile", label: "档案" },
          { key: "rfq", label: "询价" },
          { key: "quality", label: "质量事件" },
        ].map((t) => (
          <button
            key={t.key}
            className="nbtn"
            onClick={() => setSubTab(t.key as typeof subTab)}
            style={subTab === t.key ? { color: "var(--n-text)", borderColor: "var(--n-text)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>
      {subTab === "profile" && <SupplierProfileTab isAdmin={isAdmin} />}
      {subTab === "rfq" && <SupplierRfqTab isAdmin={isAdmin} />}
      {subTab === "quality" && <SupplierQualityTab isAdmin={isAdmin} />}
    </div>
  );
}

function SupplierProfileTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: suppliers, isLoading } = trpc.crm.supplier.list.useQuery();
  const create = trpc.crm.supplier.create.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const remove = trpc.crm.supplier.remove.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const update = trpc.crm.supplier.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWechat, setContactWechat] = useState("");
  const [accountTerms, setAccountTerms] = useState("");
  const [singleSource, setSingleSource] = useState(false);
  const [risk, setRisk] = useState("");
  const [memo, setMemo] = useState("");

  const list = (suppliers ?? []) as Supplier[];

  const submit = () => {
    const v = name.trim();
    if (!v) return;
    create.mutate({
      name: v,
      category: category || null,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      contactWechat: contactWechat || null,
      accountTerms: accountTerms || null,
      singleSource,
      risk: (risk || null) as Supplier["risk"],
      memo: memo || null,
    });
    setName("");
    setCategory("");
    setContactName("");
    setContactPhone("");
    setContactWechat("");
    setAccountTerms("");
    setSingleSource(false);
    setRisk("");
    setMemo("");
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {isAdmin && (
        <div className="ncard" style={{ padding: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "10px 12px",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">供应商名称 *</span>
              <input
                className="ninput"
                placeholder="输入供应商名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">类别</span>
              <input
                className="ninput"
                placeholder="如原料、耗材、服务"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">联系人</span>
              <input
                className="ninput"
                placeholder="姓名"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">电话</span>
              <input
                className="ninput"
                placeholder="联系电话"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">微信</span>
              <input
                className="ninput"
                placeholder="微信号"
                value={contactWechat}
                onChange={(e) => setContactWechat(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">账期</span>
              <input
                className="ninput"
                placeholder="如月结 30 天"
                value={accountTerms}
                onChange={(e) => setAccountTerms(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="nlabel">风险</span>
              <select
                className="nselect"
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                aria-label="风险"
              >
                <option value="">请选择风险</option>
                {RISK_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {SUPPLIER_RISK_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--n-text)", paddingTop: 18 }}>
              <input type="checkbox" checked={singleSource} onChange={(e) => setSingleSource(e.target.checked)} />
              单一来源
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <span className="nlabel">备注</span>
              <input
                className="ninput"
                placeholder="补充信息"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="nbtn nbtn-accent" onClick={submit} disabled={create.isPending}>
                ＋ 新建供应商
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          加载中<span className="n-blink">●</span>
        </div>
      ) : list.length === 0 ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          暂无供应商
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((s) => {
            const risk = s.risk;
            return (
            <div key={s.id} className="ncard" style={{ padding: 0, overflow: "hidden" }}>
              <div
                className="ncard-head crm-click"
                onClick={() => toggleExpand(s.id)}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--n-text)", fontWeight: 600 }}>{s.name}</span>
                  <span className="nlabel" style={{ border: "1px solid var(--n-border)", borderRadius: 999, padding: "1px 8px" }}>
                    {supplierCategoryLabel(s.category)}
                  </span>
                  {s.contactName && (
                    <span className="nlabel" style={{ color: "var(--n-faint)" }}>
                      {s.contactName}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {s.singleSource && (
                    <span className="nlabel" style={{ color: "var(--n-accent)" }}>
                      ⚠ 单一来源
                    </span>
                  )}
                  {risk && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: SUPPLIER_RISK_COLOR[risk],
                        }}
                      />
                      <span className="nlabel" style={{ color: SUPPLIER_RISK_COLOR[risk] }}>
                        {SUPPLIER_RISK_LABEL[risk]}风险
                      </span>
                    </span>
                  )}
                  <span className="nicon">{expandedId === s.id ? "−" : "＋"}</span>
                </span>
              </div>
              {expandedId === s.id && (
                <SupplierDetail
                  supplier={s}
                  isAdmin={isAdmin}
                  onUpdate={(patch) => update.mutate({ id: s.id, patch })}
                  onRemove={() => remove.mutate({ id: s.id })}
                />
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  );
}

function SupplierDetail({
  supplier,
  isAdmin,
  onUpdate,
  onRemove,
}: {
  supplier: Supplier;
  isAdmin: boolean;
  onUpdate: (patch: {
    category?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    contactWechat?: string | null;
    accountTerms?: string | null;
    risk?: Supplier["risk"];
    memo?: string | null;
  }) => void;
  onRemove: () => void;
}) {
  const qc = useQueryClient();
  const { data: docs } = trpc.crm.doc.list.useQuery(
    { subjectType: "supplier", subjectId: supplier.id },
    { enabled: true },
  );
  const createDoc = trpc.crm.doc.create.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });

  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docKind, setDocKind] = useState<typeof DOC_KIND[number]>("qualification");

  const submitDoc = () => {
    const t = docTitle.trim();
    if (!t) return;
    createDoc.mutate({
      subjectType: "supplier",
      subjectId: supplier.id,
      title: t,
      kind: docKind,
      url: docUrl || null,
    });
    setDocTitle("");
    setDocUrl("");
    setDocKind("qualification");
  };

  return (
    <div className="ncard-body" style={{ gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 8,
          fontSize: 12,
        }}
      >
        <div>
          <span className="nlabel">联系人</span> {supplier.contactName ?? "—"}
        </div>
        <div>
          <span className="nlabel">电话</span> {supplier.contactPhone ?? "—"}
        </div>
        <div>
          <span className="nlabel">微信</span> {supplier.contactWechat ?? "—"}
        </div>
        <div>
          <span className="nlabel">账期</span> {supplier.accountTerms ?? "—"}
        </div>
        <div>
          <span className="nlabel">类别</span> {supplierCategoryLabel(supplier.category)}
        </div>
      </div>
      {supplier.memo && (
        <div className="nlabel" style={{ whiteSpace: "pre-wrap" }}>
          {supplier.memo}
        </div>
      )}

      <section>
        <div className="nlabel" style={{ marginBottom: 6 }}>
          资质文档
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {((docs ?? []) as Doc[]).map((d) => (
            <div
              key={d.id}
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
              <span className="nlabel">{DOC_KIND_LABEL[d.kind as keyof typeof DOC_KIND_LABEL] ?? d.kind ?? "文件"}</span>
              <span style={{ fontSize: 12, color: "var(--n-text)", flex: 1, minWidth: 120 }}>{d.title}</span>
              {d.url && (
                <a className="nbtn" href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                  打开
                </a>
              )}
              <span className="nlabel" style={{ color: "var(--n-faint)" }}>
                v{d.version}
              </span>
            </div>
          ))}
          {((docs ?? []) as Doc[]).length === 0 && (
            <div className="nlabel" style={{ padding: "8px 0" }}>
              暂无文档
            </div>
          )}
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <input
              className="ninput"
              placeholder="文档标题"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              style={{ flex: 1, minWidth: 120 }}
            />
            <select
              className="nselect"
              value={docKind}
              onChange={(e) => setDocKind(e.target.value as typeof DOC_KIND[number])}
              style={{ width: 110 }}
              aria-label="类型"
            >
              {DOC_KIND.map((k) => (
                <option key={k} value={k}>
                  {DOC_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              className="ninput"
              placeholder="链接"
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              style={{ flex: 1, minWidth: 140 }}
            />
            <button className="nbtn" onClick={submitDoc} disabled={createDoc.isPending}>
              ＋ 文档
            </button>
          </div>
        )}
      </section>

      {isAdmin && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="nbtn"
            onClick={() => {
              const r = window.prompt("风险 H/M/L", supplier.risk ?? "L");
              if (r !== "H" && r !== "M" && r !== "L") return;
              onUpdate({ risk: r });
            }}
          >
            改风险
          </button>
          <button
            className="nbtn nicon-danger"
            onClick={() => {
              if (window.confirm("确定删除该供应商？关联的询价与质量事件将一并清理。")) {
                onRemove();
              }
            }}
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}

function SupplierRfqTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: suppliers } = trpc.crm.supplier.list.useQuery();
  const [supplierId, setSupplierId] = useState<number | "">("");
  const { data: rfqs, isLoading } = trpc.crm.rfq.list.useQuery(
    { supplierId: supplierId ? Number(supplierId) : undefined },
    { enabled: true },
  );

  const create = trpc.crm.rfq.create.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const update = trpc.crm.rfq.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const remove = trpc.crm.rfq.remove.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });

  const [showNew, setShowNew] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState<number | "">("");
  const [newItem, setNewItem] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDays, setNewDays] = useState("");
  const [newValid, setNewValid] = useState("");
  const [newMemo, setNewMemo] = useState("");

  const supplierMap = useMemo(() => {
    const map = new Map<number, string>();
    ((suppliers ?? []) as Supplier[]).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [suppliers]);

  const submit = () => {
    const item = newItem.trim();
    const sid = Number(newSupplierId);
    if (!item || !sid) return;
    create.mutate({
      supplierId: sid,
      item,
      qty: newQty || null,
      priceCny: newPrice ? Number(newPrice) : null,
      deliveryDays: newDays ? Number(newDays) : null,
      validUntil: newValid || null,
      memo: newMemo || null,
    });
    setNewItem("");
    setNewQty("");
    setNewPrice("");
    setNewDays("");
    setNewValid("");
    setNewMemo("");
    setNewSupplierId("");
    setShowNew(false);
  };

  const list = (rfqs ?? []) as Rfq[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        className="ncard"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12 }}
      >
        <select
          className="nselect"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          style={{ minWidth: 160 }}
          aria-label="供应商"
        >
          <option value="">全部供应商</option>
          {((suppliers ?? []) as Supplier[]).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {isAdmin && (
          <button className="nbtn nbtn-accent" onClick={() => setShowNew(true)} disabled={create.isPending}>
            ＋ 新建询价
          </button>
        )}
      </div>

      {showNew && (
        <div
          className="ncard"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12 }}
        >
          <select
            className="nselect"
            value={newSupplierId}
            onChange={(e) => setNewSupplierId(e.target.value ? Number(e.target.value) : "")}
            style={{ minWidth: 160 }}
            aria-label="供应商"
          >
            <option value="">选择供应商 *</option>
            {((suppliers ?? []) as Supplier[]).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            className="ninput"
            placeholder="物料/服务 *"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            style={{ flex: 1, minWidth: 140 }}
          />
          <input
            className="ninput"
            placeholder="数量"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            style={{ width: 100 }}
          />
          <input
            className="ninput"
            type="number"
            placeholder="单价"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            style={{ width: 100 }}
          />
          <input
            className="ninput"
            type="number"
            placeholder="交期(天)"
            value={newDays}
            onChange={(e) => setNewDays(e.target.value)}
            style={{ width: 100 }}
          />
          <input
            className="ninput"
            type="date"
            value={newValid}
            onChange={(e) => setNewValid(e.target.value)}
            style={{ width: 140 }}
          />
          <input
            className="ninput"
            placeholder="备注"
            value={newMemo}
            onChange={(e) => setNewMemo(e.target.value)}
            style={{ flex: 1, minWidth: 120 }}
          />
          <button className="nbtn" onClick={() => setShowNew(false)}>
            取消
          </button>
          <button className="nbtn nbtn-accent" onClick={submit} disabled={create.isPending}>
            保存
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          加载中<span className="n-blink">●</span>
        </div>
      ) : list.length === 0 ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          暂无询价
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((r) => (
            <div
              key={r.id}
              className="ncard"
              style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12 }}
            >
              <span style={{ fontSize: 12, color: "var(--n-text)", flex: 1, minWidth: 140 }}>{r.item}</span>
              <span className="nlabel" style={{ color: "var(--n-faint)" }}>
                {supplierMap.get(r.supplierId) ?? `供应商#${r.supplierId}`}
              </span>
              <span className="nlabel">{r.qty ?? "—"}</span>
              <span className="font-dot" style={{ fontSize: 12 }}>
                {fmtMoney(Number(r.priceCny ?? 0))}
              </span>
              <span className="nlabel" style={{ color: "var(--n-faint)" }}>
                {r.deliveryDays ? `${r.deliveryDays}天` : "—"}
              </span>
              {r.validUntil && (
                <span className="nlabel" style={{ color: "var(--n-dim)" }}>
                  有效至 {r.validUntil}
                </span>
              )}
              {isAdmin ? (
                <select
                  className="nselect"
                  value={r.status}
                  onChange={(e) =>
                    update.mutate({
                      id: r.id,
                      patch: { status: e.target.value as Rfq["status"] },
                    })
                  }
                  style={{ width: 110 }}
                  aria-label="状态"
                >
                  {RFQ_STATUS.map((st) => (
                    <option key={st} value={st}>
                      {RFQ_STATUS_LABEL[st]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="nlabel">{RFQ_STATUS_LABEL[r.status]}</span>
              )}
              {isAdmin && (
                <button
                  className="nicon nicon-danger"
                  onClick={() => {
                    if (window.confirm("确定删除该询价记录？")) {
                      remove.mutate({ id: r.id });
                    }
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierQualityTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: suppliers } = trpc.crm.supplier.list.useQuery();
  const [supplierId, setSupplierId] = useState<number | "">("");
  const { data: events, isLoading } = trpc.crm.qualityEvent.list.useQuery(
    { supplierId: supplierId ? Number(supplierId) : undefined },
    { enabled: true },
  );

  const create = trpc.crm.qualityEvent.create.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const update = trpc.crm.qualityEvent.update.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const remove = trpc.crm.qualityEvent.remove.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });

  const [showNew, setShowNew] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState<number | "">("");
  const [newKind, setNewKind] = useState<QualityEvent["kind"]>(("delay"));
  const [newSummary, setNewSummary] = useState("");
  const [newImpact, setNewImpact] = useState("");

  const supplierMap = useMemo(() => {
    const map = new Map<number, string>();
    ((suppliers ?? []) as Supplier[]).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [suppliers]);

  const submit = () => {
    const sid = Number(newSupplierId);
    const summary = newSummary.trim();
    if (!sid || !summary) return;
    create.mutate({
      supplierId: sid,
      kind: newKind,
      summary,
      impact: newImpact || null,
    });
    setNewSupplierId("");
    setNewKind("delay");
    setNewSummary("");
    setNewImpact("");
    setShowNew(false);
  };

  const resolve = (e: QualityEvent) => {
    update.mutate({ id: e.id, patch: { resolvedAt: todayStr() } });
  };

  const list = (events ?? []) as QualityEvent[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        className="ncard"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12 }}
      >
        <select
          className="nselect"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          style={{ minWidth: 160 }}
          aria-label="供应商"
        >
          <option value="">全部供应商</option>
          {((suppliers ?? []) as Supplier[]).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {isAdmin && (
          <button className="nbtn nbtn-accent" onClick={() => setShowNew(true)} disabled={create.isPending}>
            ＋ 新建事件
          </button>
        )}
      </div>

      {showNew && (
        <div
          className="ncard"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12 }}
        >
          <select
            className="nselect"
            value={newSupplierId}
            onChange={(e) => setNewSupplierId(e.target.value ? Number(e.target.value) : "")}
            style={{ minWidth: 160 }}
            aria-label="供应商"
          >
            <option value="">选择供应商 *</option>
            {((suppliers ?? []) as Supplier[]).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="nselect"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as QualityEvent["kind"])}
            style={{ width: 110 }}
            aria-label="类型"
          >
            {QUALITY_KIND.map((k) => (
              <option key={k} value={k}>
                {QUALITY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input
            className="ninput"
            placeholder="摘要 *"
            value={newSummary}
            onChange={(e) => setNewSummary(e.target.value)}
            style={{ flex: 1, minWidth: 140 }}
          />
          <input
            className="ninput"
            placeholder="影响"
            value={newImpact}
            onChange={(e) => setNewImpact(e.target.value)}
            style={{ flex: 1, minWidth: 120 }}
          />
          <button className="nbtn" onClick={() => setShowNew(false)}>
            取消
          </button>
          <button className="nbtn nbtn-accent" onClick={submit} disabled={create.isPending}>
            保存
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          加载中<span className="n-blink">●</span>
        </div>
      ) : list.length === 0 ? (
        <div className="nlabel" style={{ textAlign: "center", padding: 40 }}>
          暂无质量事件
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((e) => (
            <div
              key={e.id}
              className="ncard"
              style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--n-text)", fontWeight: 600 }}>
                  {QUALITY_KIND_LABEL[e.kind]} · {supplierMap.get(e.supplierId) ?? `供应商#${e.supplierId}`}
                </span>
                {e.resolvedAt ? (
                  <span className="nlabel" style={{ color: "var(--n-dim)" }}>
                    已闭环 {e.resolvedAt}
                  </span>
                ) : (
                  <span className="nlabel" style={{ color: "var(--n-accent)" }}>
                    未闭环
                  </span>
                )}
              </div>
              <div className="nlabel" style={{ color: "var(--n-text)", whiteSpace: "pre-wrap" }}>
                {e.summary}
              </div>
              {e.impact && (
                <div className="nlabel" style={{ color: "var(--n-faint)" }}>
                  影响：{e.impact}
                </div>
              )}
              {isAdmin && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {!e.resolvedAt && (
                    <button className="nbtn" onClick={() => resolve(e)}>
                      标记今日闭环
                    </button>
                  )}
                  <button
                    className="nbtn nicon-danger"
                    onClick={() => {
                      if (window.confirm("确定删除该质量事件？")) {
                        remove.mutate({ id: e.id });
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
