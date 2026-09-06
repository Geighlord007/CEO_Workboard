import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { DESTRUCTIVE_KINDS } from "@contracts/commands";

/**
 * 看板指令助手 · 悬浮入口
 * 一句话 → ai.plan 解析成可预览步骤 → 确认 → ai.execute 单事务执行 → 全看板刷新。
 * 破坏性操作（删除类）在步骤列表里红字标注；失败批次整体回滚，不会半途生效。
 */
export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const queryClient = useQueryClient();

  const plan = trpc.ai.plan.useMutation();
  const exec = trpc.ai.execute.useMutation({
    onSuccess: (r) => {
      if (r.ok) void queryClient.invalidateQueries();
    },
  });
  const busy = plan.isPending || exec.isPending;

  const steps = plan.data?.ok === true ? plan.data.steps : null;

  const reset = () => {
    plan.reset();
    exec.reset();
  };
  const close = () => {
    if (busy) return;
    setOpen(false);
    reset();
    setText("");
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
    <>
      <button
        className="nbtn"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="AI 指令助手"
        title="AI 指令助手：一句话改看板"
        style={{
          position: "fixed",
          right: 22,
          bottom: 22,
          zIndex: 60,
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          padding: "13px 24px",
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "0.06em",
          background: "var(--n-accent)",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          boxShadow: "0 8px 28px rgba(215,25,33,0.4)",
          cursor: "pointer",
        }}
      >
        <span className="font-dot" style={{ color: "#fff", fontSize: 15 }}>✦</span>
        <span>AI 指令</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AI 指令助手"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 55,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "start center",
            padding: "9vh 16px 16px",
          }}
        >
          <div
            className="ncard"
            style={{
              width: "min(600px, 100%)",
              maxHeight: "78vh",
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            }}
          >
            {/* 头部 */}
            <div className="ncard-head">
              <span className="nlabel">
                <span className="font-dot" style={{ color: "var(--n-accent)", marginRight: 8 }}>✦</span>
                AI 指令助手
              </span>
              <button className="nicon" onClick={close} aria-label="关闭">×</button>
            </div>

            <div className="ncard-body" style={{ gap: 8, overflow: "auto" }}>
              {/* 执行结果 */}
              {exec.data?.ok === true && (
                <div style={{ padding: "10px 0 4px" }}>
                  <div className="nlabel" style={{ color: "var(--n-text)", letterSpacing: "0.08em", textTransform: "none", marginBottom: 8 }}>
                    ✓ 已执行 {exec.data.executed} 项操作，看板已刷新
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="nbtn" onClick={() => { reset(); setText(""); }}>再发一条</button>
                    <button className="nbtn nbtn-accent" onClick={close}>完成</button>
                  </div>
                </div>
              )}

              {/* 执行失败：整批回滚 */}
              {exec.data && !exec.data.ok && (
                <div style={{ padding: "10px 0 4px" }}>
                  <div className="nlabel nlabel-accent" style={{ marginBottom: 6 }}>执行失败 · 已整体回滚，未改动任何数据</div>
                  <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--n-text)", whiteSpace: "pre-wrap" }}>
                    第 {exec.data.at + 1} 步：{exec.data.message}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button className="nbtn" onClick={() => exec.reset()}>返回</button>
                  </div>
                </div>
              )}

              {/* 计划失败 / 追问 */}
              {plan.data && !plan.data.ok && !exec.isPending && !exec.data && (
                <div style={{ padding: "10px 0 4px" }}>
                  <div className="nlabel nlabel-accent" style={{ marginBottom: 6 }}>
                    {plan.data.code === "not_configured" ? "未配置 LLM" : "需要你补充/换个说法"}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--n-text)", whiteSpace: "pre-wrap" }}>
                    {plan.data.message}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button className="nbtn" onClick={() => plan.reset()}>知道了</button>
                  </div>
                </div>
              )}

              {/* 步骤预览 */}
              {steps && !exec.data && (
                <div style={{ padding: "6px 0 2px" }}>
                  <div className="nlabel" style={{ margin: "2px 0 8px" }}>
                    {steps.length} 项操作 · 破坏性操作已红字标注 · 点击执行后整体生效
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {steps.map((s, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 12,
                          lineHeight: 1.6,
                          padding: "5px 8px",
                          borderRadius: 6,
                          background: "var(--n-card2)",
                          border: "1px solid var(--n-border-soft)",
                        }}
                      >
                        <span className="nlabel" style={{ flex: "none" }}>{String(i + 1).padStart(2, "0")}</span>
                        <span style={{ flex: 1, minWidth: 0, color: DESTRUCTIVE_KINDS.has(s.kind) ? "var(--n-accent)" : "var(--n-text)" }}>
                          {s.label}
                        </span>
                        {DESTRUCTIVE_KINDS.has(s.kind) && (
                          <span className="nlabel nlabel-accent" style={{ flex: "none" }}>破坏性</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    <button className="nbtn" onClick={() => plan.reset()} disabled={busy}>返回修改</button>
                    <button className="nbtn nbtn-accent" onClick={confirm} disabled={busy}>
                      {exec.isPending ? "执行中…" : `执行 ${steps.length} 项`}
                    </button>
                  </div>
                </div>
              )}

              {/* 输入 */}
              {!steps && !plan.data && !exec.data && (
                <>
                  {plan.error && (
                    <div style={{ fontSize: 11, color: "var(--n-accent)", padding: "2px 0" }}>
                      请求失败：{plan.error.message}
                    </div>
                  )}
                  <textarea
                    className="ninput"
                    autoFocus
                    rows={3}
                    value={text}
                    disabled={busy}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={'用一句话改看板，例如："本周任务全部标完成"\n"记个任务：BD 跟进华电合同，周五前"\n"下周三下午3点 供应商评审会"\n"把 XX 顺延到下周"'}
                    style={{ width: "100%", minHeight: 76, resize: "vertical", lineHeight: 1.6 }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button className="nbtn nbtn-accent" onClick={send} disabled={busy || !text.trim()}>
                      {plan.isPending ? "解析中…" : "发送"}
                    </button>
                    <span className="nlabel" style={{ marginLeft: "auto" }}>Enter 发送 · Shift+Enter 换行</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
