import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { DESTRUCTIVE_KINDS } from "@contracts/commands";

/**
 * CRM 顶部 AI 快捷栏
 * 一句话 → ai.plan → 步骤预览 → ai.execute → 刷新 CRM 数据
 */
export function CrmAiBar() {
  const [text, setText] = useState("");
  const queryClient = useQueryClient();

  const plan = trpc.ai.plan.useMutation();
  const exec = trpc.ai.execute.useMutation({
    onSuccess: (r) => {
      if (r.ok) void queryClient.invalidateQueries();
      setText("");
    },
  });

  const busy = plan.isPending || exec.isPending;
  const steps = plan.data?.ok === true ? plan.data.steps : null;
  const planError = plan.data && !plan.data.ok ? plan.data : null;
  const execError = exec.data && !exec.data.ok ? exec.data : null;

  const reset = () => {
    plan.reset();
    exec.reset();
    setText("");
  };

  const send = () => {
    const v = text.trim();
    if (!v || busy) return;
    plan.mutate({ text: v });
  };

  const confirm = () => {
    if (!steps || busy) return;
    exec.mutate({ steps });
  };

  return (
    <div
      className="ncard"
      style={{
        padding: "8px 12px",
        marginBottom: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="font-dot" style={{ color: "var(--n-accent)", fontSize: 12 }}>
          ✦
        </span>
        <input
          className="ninput"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder='用一句话操作 CRM，例如：给北科生物记一次微信沟通，下周五前发方案'
          style={{ flex: 1, minWidth: 220 }}
          disabled={busy}
        />
        {!steps && !planError && !execError && (
          <button className="nbtn nbtn-accent" onClick={send} disabled={busy || !text.trim()}>
            {plan.isPending ? "解析中…" : "发送"}
          </button>
        )}
        {steps && !exec.data && (
          <>
            <button className="nbtn" onClick={() => plan.reset()} disabled={busy}>
              返回
            </button>
            <button className="nbtn nbtn-accent" onClick={confirm} disabled={busy}>
              {exec.isPending ? "执行中…" : `执行 ${steps.length} 项`}
            </button>
          </>
        )}
        {(planError || execError) && (
          <button className="nbtn" onClick={reset}>
            知道了
          </button>
        )}
        {exec.data?.ok === true && (
          <button className="nbtn" onClick={reset}>
            再发一条
          </button>
        )}
      </div>

      {steps && !exec.data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {steps.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 6,
                background: "var(--n-card2)",
              }}
            >
              <span className="nlabel" style={{ flex: "none" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: DESTRUCTIVE_KINDS.has(s.kind) ? "var(--n-accent)" : "var(--n-text)",
                }}
              >
                {s.label}
              </span>
              {DESTRUCTIVE_KINDS.has(s.kind) && (
                <span className="nlabel nlabel-accent" style={{ flex: "none" }}>
                  破坏性
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {planError && (
        <div className="nlabel nlabel-accent">
          {planError.code === "not_configured" ? "未配置 LLM" : planError.message}
        </div>
      )}

      {execError && (
        <div className="nlabel nlabel-accent">
          执行失败（第 {execError.at + 1} 步）：{execError.message}
        </div>
      )}

      {exec.data?.ok === true && (
        <div className="nlabel" style={{ color: "var(--n-text)" }}>
          ✓ 已执行 {exec.data.executed} 项操作，数据已刷新
        </div>
      )}
    </div>
  );
}
