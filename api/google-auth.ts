/* ============================================================================
 * Google 登录认证（自部署版，替代原 Kimi OAuth）
 * ----------------------------------------------------------------------------
 * 流程：前端 Google Identity Services 按钮 → 拿到 credential（ID token）
 *      → POST /api/auth/google → 本模块用 google-auth-library 验签
 *      → 校验邮箱白名单 → upsert 用户 → 签发会话 cookie
 * ==========================================================================*/
import { OAuth2Client } from "google-auth-library";
import * as jose from "jose";
import * as cookie from "cookie";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { users, type InsertUser } from "@db/schema";
import { env } from "./lib/env";
import { Session } from "@contracts/constants";

const client = new OAuth2Client(env.googleClientId);
const JWT_ALG = "HS256";

type SessionPayload = { email: string; name?: string };

/* ---------- 会话 JWT ---------- */
export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT({ ...payload, clientId: env.googleClientId })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (!payload.email) return null;
    return { email: payload.email as string, name: payload.name as string | undefined };
  } catch {
    return null;
  }
}

/* ---------- 用户表 ---------- */
export async function findUserByEmail(email: string) {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows.at(0);
}

export async function upsertGoogleUser(data: {
  email: string;
  name?: string | null;
  avatar?: string | null;
}) {
  const values: InsertUser = {
    unionId: `g:${data.email}`, // 用邮箱做唯一标识，前缀标明来源
    email: data.email,
    name: data.name ?? data.email.split("@")[0],
    avatar: data.avatar ?? null,
    lastSignInAt: new Date(),
  };
  // 第一个登录的（白名单里的第一个邮箱）给 admin，其余 user
  if (env.allowedEmails[0] === data.email.toLowerCase()) {
    values.role = "admin";
  }
  await getDb()
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        name: values.name,
        avatar: values.avatar,
        lastSignInAt: values.lastSignInAt,
      },
    });
}

/* ---------- 登录处理 ---------- */
/** 校验 Google ID token；通过则签发会话 cookie 内容，返回给路由层写 cookie */
export async function loginWithGoogle(credential: string): Promise<
  | { ok: true; token: string }
  | { ok: false; status: number; message: string }
> {
  if (!env.googleClientId) {
    return { ok: false, status: 500, message: "服务器未配置 GOOGLE_CLIENT_ID" };
  }
  // 先做本地结构校验：JWT 必须是三段、payload 能解析出 iss，
  // 避免明显伪造的 token 触发对 Google 公钥端点的远程请求而挂起
  const parts = credential.split(".");
  if (parts.length !== 3) {
    return { ok: false, status: 401, message: "Google 登录凭证无效" };
  }
  try {
    const payloadJson = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { iss?: string };
    if (
      payloadJson.iss !== "https://accounts.google.com" &&
      payloadJson.iss !== "accounts.google.com"
    ) {
      return { ok: false, status: 401, message: "Google 登录凭证无效" };
    }
  } catch {
    return { ok: false, status: 401, message: "Google 登录凭证无效" };
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    });
  } catch {
    return { ok: false, status: 401, message: "Google 登录凭证无效或已过期" };
  }
  const payload = ticket.getPayload();
  const email = payload?.email?.toLowerCase();
  if (!email || !payload?.email_verified) {
    return { ok: false, status: 401, message: "未能获取已验证的邮箱" };
  }
  // 邮箱白名单拦截
  if (env.allowedEmails.length > 0 && !env.allowedEmails.includes(email)) {
    return { ok: false, status: 403, message: `邮箱 ${email} 不在允许登录的名单内` };
  }

  await upsertGoogleUser({
    email,
    name: payload.name,
    avatar: payload.picture,
  });

  const token = await signSessionToken({ email, name: payload.name });
  return { ok: true, token };
}

/* ---------- 请求认证（tRPC context 用） ---------- */
export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) return undefined;
  const claim = await verifySessionToken(token);
  if (!claim) return undefined;
  return findUserByEmail(claim.email);
}
