/* ============================================================================
 * 本地联测用户铸造工具
 * ----------------------------------------------------------------------------
 * 用法：npx tsx scripts/make-user.ts <email> [role]
 * role 默认 admin；生成 .cookie-<email> 文件供联测使用。
 * 不打印完整 token。
 * ==========================================================================*/
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { users } from "../db/schema";
import { signSessionToken } from "../api/google-auth";

const rawEmail = process.argv[2];
const role = (process.argv[3] ?? "admin") as "admin" | "user";

if (!rawEmail) {
  console.error("用法：npx tsx scripts/make-user.ts <email> [role]");
  process.exit(1);
}

const email = rawEmail.startsWith("g:") ? rawEmail.slice(2) : rawEmail;
const unionId = rawEmail.startsWith("g:") ? rawEmail : `g:${email}`;
const name = email.split("@")[0] ?? email;

async function main() {
  const db = getDb();

  await db
    .insert(users)
    .values({
      unionId,
      email,
      name,
      role,
      lastSignInAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        name,
        role,
        lastSignInAt: new Date(),
      },
    });

  const token = await signSessionToken({ email, name });
  const file = `.cookie-${email}`;
  writeFileSync(file, `wtc_sid=${token}`);

  console.log(`账号：${email}  角色：${role}  cookie 文件：${file}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
