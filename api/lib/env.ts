import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

/**
 * 环境变量（自部署版）。
 * 本地开发填在 .env；生产部署在 PaaS 平台（Sealos / Zeabur / 云托管）配置。
 * 详见 部署指南.md
 */
export const env = {
  isProduction: process.env.NODE_ENV === "production",

  /** Google OAuth Client ID（可选；不配置则仅用邮箱登录） */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",

  /** 签发会话 JWT 的密钥：任意长随机字符串，可用 `openssl rand -hex 32` 生成 */
  appSecret: required("APP_SECRET"),

  /** MySQL 连接串，例如 mysql://user:pass@host:4000/db?ssl={"rejectUnauthorized":true} */
  databaseUrl: required("DATABASE_URL"),

  /** 允许登录的邮箱白名单，逗号分隔，例如 "you@example.com,boss@example.com" */
  allowedEmails: (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  /** 邮箱登录：第一个管理员邮箱（首个账号用它 + ADMIN_INITIAL_PASSWORD 首登） */
  adminEmail: (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),

  /** 邮箱登录：管理员初始密码，首次登录用；登录一次后即被本人设置的密码取代 */
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD ?? "",

  /** 看板指令助手的 LLM（OpenAI 兼容协议；不配置则该功能不可用） */
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? "",
    apiKey: process.env.LLM_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "",
  },
};