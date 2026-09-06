import { trpc } from "@/providers/trpc";
import { OPP_STAGE_LABEL, OPP_STAGE_ORDER, fmtMoney } from "./crmMeta";

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="ncard crm-click" style={{ padding: 14 }}>
      <div className="nlabel" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div
        className="font-dot"
        style={{
          fontSize: 22,
          color: accent ? "var(--n-accent)" : "var(--n-text)",
          letterSpacing: "0.04em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function ReportPage() {
  const { data, isLoading } = trpc.crm.opportunity.summary.useQuery();

  if (isLoading) {
    return (
      <div className="nlabel" style={{ padding: "40px 0", textAlign: "center" }}>
        加载中<span className="n-blink">●</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="nlabel" style={{ padding: "40px 0", textAlign: "center" }}>
        暂无汇总数据
      </div>
    );
  }

  const totalCount = Object.values(data.byStage).reduce((a, s) => a + s.count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        <Metric label="管道总值" value={fmtMoney(data.totalAmount)} />
        <Metric label="加权预测" value={fmtMoney(data.weighted)} />
        <Metric label="滞留商机" value={String(data.staleCount)} accent />
        <Metric label="7日内动作" value={String(data.nextDueCount)} />
        <Metric label="商机总数" value={String(totalCount)} />
      </div>

      <section className="ncard">
        <header className="ncard-head">
          <span className="nlabel">
            <span className="nlabel-accent" aria-hidden>
              ●&nbsp;
            </span>
            各阶段金额
          </span>
        </header>
        <div className="ncard-body">
          {totalCount === 0 ? (
            <div className="nlabel" style={{ textAlign: "center", padding: "24px 0" }}>
              还没有商机，去“商机”页创建第一条吧
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {OPP_STAGE_ORDER.map((stage) => {
                const s = data.byStage[stage];
                if (!s || s.count === 0) return null;
                return (
                  <div
                    key={stage}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "var(--n-card2)",
                    }}
                  >
                    <span className="nlabel" style={{ flex: "none", minWidth: 80 }}>
                      {OPP_STAGE_LABEL[stage] ?? stage}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                      {s.count} 个
                    </span>
                    <span
                      className="font-dot"
                      style={{ flex: "none", fontSize: 14, color: "var(--n-text)" }}
                    >
                      {fmtMoney(s.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="nlabel" style={{ textAlign: "center", padding: "24px 0", color: "var(--n-faint)" }}>
        暂无更多数据
      </div>
    </div>
  );
}
