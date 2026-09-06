/* ============================================================================
 * 邮箱 + 密码登录（自部署版，替代/补充 Google OAuth）
 * ----------------------------------------------------------------------------
 * 目标：彻底脱离 Google 依赖，国内生态即可部署。
 * 密码哈希使用 Node 内置 crypto.scrypt（零依赖、无需额外安装 npm 包）。
 *
 * 首次登录流程：
 *   1. 在 .env.production 里配置 ADMIN_EMAIL（第一个管理员邮箱）
 *   2. 首次用该邮箱登录，后端用 ADMIN_INITIAL_PASSWORD 校验通过后
 *      即签发会话，并把密码哈希写入该邮箱账户
 *   3. 之后登录用自己设置的密码（首次设置的就是实际密码）
 * ==========================================================================*/
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { env } from "./lib/env";
import { signSessionToken } from "./google-auth";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;

/** 用 scrypt 把明文密码 hash 成 "salt:hash" 字符串 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LEN);
  return `${salt}:${derived.toString("hex")}`;
}

/** 校验明文密码是否匹配存储的 "salt:hash" */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(password, salt, KEY_LEN);
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

function isValidPassword(pw: string): boolean {
  return pw.length >= 6;
}

/**
 * 邮箱 + 密码登录主逻辑。
 * 首次登录：配置了 ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD 时，
 * 用管理员初始密码初始化该邮箱账户（以后用它自己的密码登录）。
 */
export async function loginWithPassword(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) {
    return { ok: false as const, status: 401 as const, message: "请输入邮箱和密码" };
  }

  // 白名单拦截（同 Google 登录逻辑）
  const allowed = env.allowedEmails;
  if (allowed.length > 0 && !allowed.includes(normalized)) {
    return { ok: false as const, status: 403 as const, message: "该邮箱不在允许登录的名单内" };
  }

  // 查用户
  const existing = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  let user = existing.at(0);

  // 首次登录：无密码哈希 → 用管理员初始密码建立
  if (!user?.passwordHash) {
    const isAdminBootstrap =
      env.adminEmail === normalized && !!env.adminInitialPassword;
    if (!isAdminBootstrap) {
      return {
        ok: false as const,
        status: 401 as const,
        message: "该账号尚未设置密码，请先用管理员初始密码初始化",
      };
    }
    if (password !== env.adminInitialPassword) {
      return {
        ok: false as const,
        status: 401 as const,
        message: "管理员初始密码错误",
      };
    }
    const pwHash = await hashPassword(password);
    if (user) {
      await getDb()
        .update(users)
        .set({ passwordHash: pwHash, lastSignInAt: new Date() })
        .where(eq(users.id, user.id));
    } else {
      // 首次创建：unionId 用 "p:email" 前缀标明邮箱登录来源
      await getDb()
        .insert(users)
        .values({
          unionId: `p:${normalized}`,
          email: normalized,
          name: normalized.split("@")[0],
          role: "admin",
          passwordHash: pwHash,
          lastSignInAt: new Date(),
        });
      user = (await getDb()
        .select()
        .from(users)
        .where(eq(users.email, normalized))
        .limit(1)).at(0);
    }
    const token = await signSessionToken({ email: normalized, name: user?.name ?? undefined });
    return { ok: true as const, token };
  }

  // 已有密码哈希 → 校验密码
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { ok: false as const, status: 401 as const, message: "邮箱或密码错误" };
  }
  await getDb()
    .update(users)
    .set({ lastSignInAt: new Date() })
    .where(eq(users.id, user.id));
  const token = await signSessionToken({ email: normalized, name: user.name ?? undefined });
  return { ok: true as const, token };
}