import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
        };
      };
    };
  }
}

/**
 * 登录页：支持两种方式——
 *  1. 邮箱 + 密码（国内生态主推，脱离 Google，无需任何第三方）
 *  2. Google（可选）：若后端配置了 GOOGLE_CLIENT_ID 则显示
 */
export default function Login() {
  const btnRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Google 相关状态（可选）
  const [clientId, setClientId] = useState<string | null | undefined>(undefined);
  const [configError, setConfigError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // 探测是否配置了 Google client id；没配置则纯用邮箱登录
    fetch("/api/auth/google/config")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((cfg: { clientId?: string | null }) => {
        if (!cancelled) setClientId(cfg.clientId ?? null);
      })
      .catch(() => {
        if (!cancelled) setConfigError("无法加载登录配置");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 若配置了 Google client id，渲染 Google 按钮
  useEffect(() => {
    if (!clientId) return;
    const init = () => {
      if (!window.google || !btnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: { credential: string }) => {
          setError("");
          const r = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ credential: resp.credential }),
          });
          if (r.ok) {
            navigate("/", { replace: true });
          } else {
            const data = (await r.json().catch(() => ({}))) as { error?: string };
            setError(data.error ?? "登录失败，请重试");
          }
        },
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        logo_alignment: "left",
        width: 260,
      });
    };
    if (window.google) {
      init();
    } else {
      const t = setInterval(() => {
        if (window.google) {
          clearInterval(t);
          init();
        }
      }, 200);
      return () => clearInterval(t);
    }
  }, [clientId, navigate]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/password/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) {
        navigate("/", { replace: true });
      } else {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "登录失败，请重试");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const googleReady = !!clientId;

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--n-bg)",
      }}
    >
      {/* Google Identity Services 脚本（仅当使用 Google 登录时才加载） */}
      {googleReady && (
        <script src="https://accounts.google.com/gsi/client" async defer />
      )}
      <div
        style={{
          background: "var(--n-card)",
          border: "1px solid var(--n-border)",
          borderRadius: 12,
          padding: "36px 40px",
          minWidth: 320,
          width: 340,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div className="font-dot" style={{ fontSize: 22, color: "var(--n-text)" }}>
            WTC
          </div>
          <div className="nlabel" style={{ marginTop: 6, marginBottom: 20 }}>
            每周任务控制台
          </div>
        </div>

        {/* 邮箱 + 密码登录 */}
        <form onSubmit={submitPassword} style={{ display: "grid", gap: 10 }}>
          <input
            type="email"
            autoComplete="email"
            placeholder="邮箱（需在白名单内）"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--n-border)",
              background: "var(--n-input, var(--n-card))",
              color: "var(--n-text)",
              fontSize: 13,
            }}
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--n-border)",
              background: "var(--n-input, var(--n-card))",
              color: "var(--n-text)",
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: "var(--n-accent, #2563eb)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "登录中…" : "登 录"}
          </button>
        </form>

        {error && (
          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              color: "var(--n-accent)",
              lineHeight: 1.6,
            }}
          >
            {error}
          </div>
        )}

        {/* Google 分隔线（可选） */}
        {googleReady && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "20px 0 12px",
                color: "var(--n-faint)",
                fontSize: 11,
              }}
            >
              <span style={{ flex: 1, height: 1, background: "var(--n-border)" }} />
              或使用 Google
              <span style={{ flex: 1, height: 1, background: "var(--n-border)" }} />
            </div>
            <div style={{ display: "grid", placeItems: "center", minHeight: 44 }}>
              <div ref={btnRef} />
            </div>
          </>
        )}

        {!googleReady && configError && (
          <div style={{ marginTop: 14, fontSize: 11, color: "var(--n-accent)" }}>
            登录配置加载失败，请稍后重试
          </div>
        )}

        <div
          className="nlabel"
          style={{
            marginTop: 20,
            color: "var(--n-faint)",
            letterSpacing: "0.1em",
            textAlign: "center",
          }}
        >
          INTERNAL TOOL · AUTHORIZED ONLY
        </div>
      </div>
    </div>
  );
}