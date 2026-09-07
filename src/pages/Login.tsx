import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { InstallPwa } from "@/components/InstallPwa";

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

/** 3×3 点阵 LOGO（登录页放大版） */
function DotLogo({ size = 26 }: { size?: number }) {
  const on = [0, 1, 2, 4, 5, 6, 7, 8];
  return (
    <svg width={size} height={size} viewBox="0 0 3 3" aria-hidden>
      {Array.from({ length: 9 }).map((_, i) => (
        <rect
          key={i}
          x={i % 3}
          y={Math.floor(i / 3)}
          width={0.72}
          height={0.72}
          rx={0.12}
          fill={on.includes(i) ? (i === 8 ? "var(--n-accent)" : "var(--n-text)") : "var(--n-lv1)"}
        />
      ))}
    </svg>
  );
}

/**
 * 登录页（霓虹版）：邮箱 + 密码主推；Google 可选（配置了才显示）
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 13px",
    borderRadius: 11,
    border: "1px solid var(--n-border)",
    background: "color-mix(in srgb, var(--n-card2) 70%, transparent)",
    color: "var(--n-text)",
    fontSize: 13,
    outline: "none",
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(20px, env(safe-area-inset-top, 0px)) 16px max(24px, env(safe-area-inset-bottom, 0px))",
        boxSizing: "border-box",
      }}
    >
      {/* Google Identity Services 脚本（仅当使用 Google 登录时才加载） */}
      {googleReady && (
        <script src="https://accounts.google.com/gsi/client" async defer />
      )}
      <div
        style={{
          position: "relative",
          background: "color-mix(in srgb, var(--n-card) 88%, transparent)",
          border: "1px solid color-mix(in srgb, var(--nx-c2) 45%, var(--n-border))",
          borderRadius: 20,
          padding: "clamp(26px, 6vw, 40px)",
          width: "min(360px, calc(100vw - 36px))",
          boxSizing: "border-box",
          backdropFilter: "blur(18px) saturate(1.4)",
          WebkitBackdropFilter: "blur(18px) saturate(1.4)",
          boxShadow:
            "0 0 0 1px rgba(129,140,248,0.12), 0 30px 70px -28px rgba(76,90,255,0.5), 0 0 60px -24px rgba(34,211,238,0.35)",
          overflow: "hidden",
        }}
      >
        {/* 顶部霓虹发丝 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 28,
            right: 28,
            height: 2,
            background: "linear-gradient(90deg, transparent, #22d3ee, #818cf8, #e879f9, transparent)",
            opacity: 0.9,
          }}
        />
        <div style={{ textAlign: "center" }}>
          <span className="nx-logo">
            <DotLogo size={30} />
          </span>
          <div className="font-dot nx-brand" style={{ fontSize: 28, marginTop: 10 }}>
            WTC
          </div>
          <div className="nlabel" style={{ marginTop: 8, marginBottom: 22 }}>
            每周任务控制台
          </div>
        </div>

        {/* 邮箱 + 密码登录 */}
        <form onSubmit={submitPassword} style={{ display: "grid", gap: 11 }}>
          <input
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="邮箱（需在白名单内）"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={submitting}
            className="nbtn nbtn-accent"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 0",
              borderRadius: 11,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.2em",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
              marginTop: 2,
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
            marginTop: 22,
            color: "var(--n-faint)",
            letterSpacing: "0.1em",
            textAlign: "center",
          }}
        >
          INTERNAL TOOL · AUTHORIZED ONLY
        </div>
      </div>

      {/* 手机：安装到桌面引导 */}
      <InstallPwa />
    </div>
  );
}
