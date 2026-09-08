import { trpc } from "@/providers/trpc";
import {
  FOLLOWUP_ENTITY_META, useFollowupNames, type FollowupEntityType,
} from "@/components/modules/FollowupsPage";

const ALL_TYPES: FollowupEntityType[] = ["account", "supplier", "investor", "contact"];

const TYPE_SHORT: Record<FollowupEntityType, string> = {
  account: "客",
  supplier: "供",
  investor: "投",
  contact: "脉",
};

/** 看板「最近跟进」卡：跨客户/供应商/投资人/人脉，按日期倒序取最近 12 条 */
export function FollowupsCard() {
  const { data } = trpc.crm.followup.list.useQuery();
  const names = useFollowupNames(ALL_TYPES);
  const rows = (data ?? []).slice(0, 12);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: "none", paddingBottom: 6, borderBottom: "1px dashed var(--n-border)" }}>
        <span className="nlabel" style={{ color: "var(--n-faint)" }}>
          跨客户 / 供应商 / 投资人 / 人脉 · 按日期倒序
        </span>
      </div>
      <div className="ndim-list" style={{ flex: 1, minHeight: 0, overflow: "auto", paddingTop: 6 }}>
        {rows.length === 0 && (
          <div className="nlabel" style={{ color: "var(--n-faint)", textAlign: "center", padding: "12px 0" }}>
            — 暂无跟进 · 在 CRM 任意表行抽屉点「＋ 记跟进」 —
          </div>
        )}
        {rows.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "3px 0", fontSize: 10 }}>
            <span className="font-dot" style={{ flex: "none", color: "var(--n-dim)" }}>{f.followDate}</span>
            <span
              className="nlabel"
              style={{ flex: "none", color: "var(--n-accent)" }}
              title={FOLLOWUP_ENTITY_META[f.entityType as FollowupEntityType]?.zh}
            >
              {TYPE_SHORT[f.entityType as FollowupEntityType] ?? "?"}
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--n-text)" }}>
              {names.get(`${f.entityType}:${f.entityId}`) ?? `#${f.entityId}`}
              <span style={{ color: "var(--n-dim)" }}> · {f.title}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
