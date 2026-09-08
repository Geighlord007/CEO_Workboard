import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { setCookie } from "hono/cookie";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { loginWithGoogle, signSessionToken } from "./google-auth";
import { loginWithPassword } from "./password-auth";
import { getSessionCookieOptions } from "./lib/cookies";
import { Session } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Google 登录：前端 GIS 按钮回调拿到 credential 后 POST 到这里
app.post("/api/auth/google", async (c) => {
  let credential = "";
  try {
    const body = await c.req.json<{ credential?: string }>();
    credential = body.credential ?? "";
  } catch {
    return c.json({ error: "请求格式错误" }, 400);
  }
  const result = await loginWithGoogle(credential);
  if (!result.ok) {
    return c.json({ error: result.message }, result.status as 401 | 403 | 500);
  }
  const opts = getSessionCookieOptions(c.req.raw.headers);
  setCookie(c, Session.cookieName, result.token, {
    ...opts,
    maxAge: Session.maxAgeMs / 1000,
  });
  return c.json({ ok: true });
});

// Google 登录配置（公开）：前端渲染登录按钮前先到这里取 client id。
// 由后端运行时下发，避免把 VITE_* 变量烤进前端产物——部署/轮换 Client ID 无需重新构建镜像
app.get("/api/auth/google/config", (c) =>
  c.json({ clientId: env.googleClientId || null }),
);

// 邮箱 + 密码登录（国内生态主推，脱离 Google 依赖）
app.post("/api/auth/password/login", async (c) => {
  let email = "";
  let password = "";
  try {
    const body = await c.req.json<{ email?: string; password?: string }>();
    email = body.email ?? "";
    password = body.password ?? "";
  } catch {
    return c.json({ error: "请求格式错误" }, 400);
  }
  const result = await loginWithPassword(email, password);
  if (!result.ok) {
    return c.json({ error: result.message }, result.status as 401 | 403);
  }
  const opts = getSessionCookieOptions(c.req.raw.headers);
  setCookie(c, Session.cookieName, result.token, {
    ...opts,
    maxAge: Session.maxAgeMs / 1000,
  });
  return c.json({ ok: true });
});

/** vite dev（SSR）环境下 import.meta.env.MODE = "development"；生产 esbuild 打包后不存在 */
function viteDevMode(): boolean {
  const viteEnv = (import.meta as unknown as { env?: { MODE?: string } }).env;
  return viteEnv?.MODE === "development";
}

// 本地开发免登录（仅 vite dev 环境注册；生产构建里 import.meta.env 不存在 → 404）
app.post("/api/auth/dev-login", async (c) => {
  if (!viteDevMode()) {
    return c.json({ error: "Not Found" }, 404);
  }
  const email = env.adminEmail || "dev@local";
  const token = await signSessionToken({ email, name: "本地预览" });
  const opts = getSessionCookieOptions(c.req.raw.headers);
  setCookie(c, Session.cookieName, token, { ...opts, maxAge: Session.maxAgeMs / 1000 });
  return c.json({ ok: true, email });
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

// Google Sheets 双向同步（Apps Script → 本服务，Bearer 令牌鉴权）
const { registerSyncApi } = await import("./sync");
registerSyncApi(app);

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction && !viteDevMode()) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
