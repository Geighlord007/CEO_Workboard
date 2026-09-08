import { useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { DataTable, type Column } from "@/components/table/DataTable";

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

/** 常见字段的中文列名（其余保持原字段名） */
const FIELD_LABELS: Record<string, string> = {
  id: 'ID', name: '名称', title: '标题', stage: '阶段', tags: '标签', memo: '备注', industry: '行业',
  relationshipType: '关系类型', kind: '机构类型', website: '网址', location: '地区', source: '来源',
  nextActionAt: '下次动作', lastContactAt: '最近联系', product: '产品', businessModel: '业务模式',
  cooperation: '合作内容', organism: '底盘/技术', maturity: '成熟度', category: '类别',
  contactName: '联系人', contactPhone: '电话', contactWechat: '微信', amountCny: '金额(¥)',
  startDate: '开始日期', endDate: '结束日期', accountTerms: '账期', risk: '风险', ndaSigned: 'NDA已签',
  ndaDate: 'NDA日期', firm: '机构', round: '轮次', contactTitle: '职级', contactEmail: '邮箱',
  emailKind: '邮箱状态', contactLinkedin: '领英', firstContactAt: '首次接触', nextAction: '下一步',
  progressNote: '沟通进展', roleType: '角色', outreachStage: '外联状态', affiliation: '机构',
  linkedinUrl: '领英', referral: '引荐人', email: '邮箱', wechat: '微信', phone: '电话',
  companyName: '公司', roundType: '轮次类型', announcedDate: '公布日期', amountUsd: '金额(USD)',
  amountOriginal: '原文金额', valuation: '估值', leadInvestors: '领投方', pharmaOrNon: '领域',
  sliceTags: '切片', snapshotDate: '快照日期', hq: '国家', foundedYear: '成立年', roundCount: '轮次明细',
  totalFundingUsd: '累计融资(USD)', lastFundingType: '最近轮次', lastFundingDate: '最近融资日',
  ipoStatus: '上市状态', acquiredBy: '被收购', cbUrl: 'CB链接', industries: '行业', domain: '官网',
  description: '简介', enzymeTag: '酶企标签', probability: '概率', expectedClose: '预计成交',
  nextActionDue: '下一步到期', lostReason: '输单原因',
};
/** 默认隐藏的内部字段 */
const INTERNAL_FIELDS = new Set([
  'id', 'importNote', 'externalSource', 'externalId', 'nameNormalized', 'createdAt', 'updatedAt',
  'unionId', 'passwordHash', 'lastSignInAt', 'avatar', 'ownerId', 'aiSummary',
]);

/** 数据浏览（仅管理员）：表清单 + 通用表格（搜索/筛选/排序/导出/行内编辑白名单字段） */
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

  const columns = useMemo(() => (colsQ.data?.columns ?? []) as Col[], [colsQ.data]);
  const rows = useMemo(() => (colsQ.data?.rows ?? []) as Row[], [colsQ.data]);

  const isAdmin = user?.role === "admin";

  const dtColumns: Column<Row>[] = useMemo(
    () =>
      columns.map((c) => {
        const isEnum = c.type === "enum" && !!c.enumValues?.length;
        const isBool = c.type === "bool";
        const isNum = c.type === "int" || c.type === "decimal";
        return {
          key: c.field,
          zh: FIELD_LABELS[c.field] ?? c.field,
          type: isBool ? "boolean" : isEnum ? "enum" : isNum ? "number" : "text",
          align: isNum ? "right" : "left",
          width: 140,
          editable: c.editable,
          filterable: isEnum || c.type === "varchar",
          hiddenByDefault: INTERNAL_FIELDS.has(c.field),
          options: isEnum ? c.enumValues!.map((v) => ({ value: v, zh: v })) : undefined,
          value: (r: Row) => r[c.field],
        } satisfies Column<Row>;
      }),
    [columns],
  );

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

  const saveCell = async (row: Row, field: string, value: unknown) => {
    const col = columns.find((c) => c.field === field);
    const id = Number(row.id);
    let v: unknown = value;
    if (col?.type === "bool") v = !!value;
    else if (col?.type === "int" || col?.type === "decimal") v = value === null || value === "" ? null : Number(value);
    else if (value === "" ) v = null;
    await updateRow.mutateAsync({
      table: table as never,
      id,
      patch: { [field]: v } as Record<string, string | number | boolean | null>,
    });
  };

  return (
    <div style={{ minHeight: "100dvh" }}>
      <div style={{ maxWidth: 1560, margin: "0 auto", padding: "12px 16px 40px" }}>
        {/* 顶栏 */}
        <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingBottom: 10 }}>
          <span className="font-dot nx-brand" style={{ fontSize: 16 }}>WTC·数据</span>
          <Link to="/" className="nbtn" style={{ textDecoration: "none" }}>← 返回看板</Link>
          <span className="nlabel" style={{ color: "var(--n-faint)" }}>
            共 {colsQ.data?.total ?? "…"} 行 · 可搜索/筛选/排序/导出 · 仅白名单字段可编辑
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button className="nbtn" onClick={toggleTheme}>{theme === "dark" ? "DARK" : "LIGHT"}</button>
            <span className="nlabel" style={{ color: "var(--n-faint)" }}>{user.name}</span>
            <button className="nbtn" onClick={logout}>退出</button>
          </span>
        </header>

        {/* 说明：数据页与 CRM 是同一个数据库 */}
        <div
          style={{
            marginBottom: 10,
            padding: "6px 10px",
            border: "1px dashed var(--n-border)",
            borderRadius: 8,
            fontSize: 11,
            color: "var(--n-dim)",
          }}
        >
          数据页 = 数据库原始视图：与 CRM 同一批表、实时双向同步；在这里改的字段，CRM 各表同样生效（反之亦然）。
        </div>

        {/* 表清单 */}
        <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {(tables.data ?? []).map((t) => (
            <button
              key={t.name}
              className="nbtn"
              onClick={() => setTable(t.name)}
              style={table === t.name ? { color: "var(--n-text)", borderColor: "#818cf8", boxShadow: "0 0 12px -6px rgba(129,140,248,.9)" } : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {!colsQ.data ? (
          <div className="nlabel" style={{ padding: 24 }}>加载中<span className="n-blink">●</span></div>
        ) : (
          <DataTable<Row>
            columns={dtColumns}
            rows={rows}
            loading={colsQ.isLoading}
            rowKey={(r) => Number(r.id)}
            storageKey={`raw-${table}`}
            exportName={table}
            emptyTitle="该表暂无数据"
            emptyHint="换一张表，或先导入数据"
            onCellEdit={isAdmin ? saveCell : undefined}
            onRefresh={() => colsQ.refetch()}
            initialSort={{ key: "id", dir: "desc" }}
            pageSizeOptions={[25, 50, 100, 500]}
          />
        )}

        {updateRow.isError && (
          <div className="nlabel nlabel-accent" style={{ marginTop: 8 }}>
            保存失败：{updateRow.error.message}
          </div>
        )}
        <div className="nlabel" style={{ marginTop: 8, color: "var(--n-faint)" }}>
          提示：带铅笔图标的单元格可直接改（仅白名单字段）；空值保存为 null；导出为 CSV（Excel 可直接打开）。
        </div>
      </div>
    </div>
  );
}
