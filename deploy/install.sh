#!/usr/bin/env bash
# ============================================================================
# WTC(每周任务控制台 · CRM) 服务器一键安装脚本
# 用法（在仓库根目录，Linux 服务器，bash）：
#   sudo bash deploy/install.sh [--seed] [--seed-crm] [--service]
#   --seed       灌入老看板演示数据（首次体验用，可选）
#   --seed-crm   灌入 CRM 演示数据（可选；会清空 CRM 表后重建，仅演示）
#   --service    安装并启动 systemd 服务（需 root；否则打印托管建议）
# 环境变量/文件：仓库根 .env 或环境变量必须含 APP_SECRET 与 DATABASE_URL（见 deploy/README.md）
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> WTC install @ $ROOT"
command -v node >/dev/null || { echo "缺少 node(>=20)"; exit 1; }
node -e 'process.exit(Number(process.versions.node.split(".")[0])>=20?0:1)' || { echo "node 版本过低(需>=20)"; exit 1; }
command -v npm >/dev/null || { echo "缺少 npm"; exit 1; }

# --- 1. 环境变量 ---
if [ ! -f .env ]; then
  echo "!! 未发现 .env。请先创建（可参考 deploy/README.md 第2步模板）。"
  exit 1
fi
# .env 会被应用自身(dotenv)加载，脚本只做必要检查
set -a; . ./.env; set +a
: "${APP_SECRET:?请在 .env 提供 APP_SECRET}"
: "${DATABASE_URL:?请在 .env 提供 DATABASE_URL}"

# --- 2. 依赖与构建 ---
echo "==> npm ci"
npm ci --no-audit --no-fund
echo "==> npm run build"
npm run build

# --- 3. 数据库 schema（结构变更会全量 diff，请先备份） ---
echo "==> db:push"
npm run db:push

# --- 4. 可选种子/迁移 ---
if [[ " $* " == *" --seed "* ]]; then echo "==> seed(老看板演示数据)"; npx tsx db/seed.ts; fi
if [[ " $* " == *" --seed-crm "* ]]; then echo "==> seed-crm(CRM 演示数据，会清空 CRM 表)"; npx tsx db/seed-crm.ts; fi

# --- 5. 托管 ---
if [[ " $* " == *" --service "* ]]; then
  echo "==> 安装 systemd 服务 wtc"
  if [ "$(id -u)" != "0" ]; then echo "安装服务需要 root（sudo 重跑 --service）"; exit 1; fi
  sed "s|__ROOT__|$ROOT|g" deploy/wtc.service > /etc/systemd/system/wtc.service
  systemctl daemon-reload
  systemctl enable --now wtc
  echo "==> 已启动：systemctl status wtc"
else
  cat <<'EOF'
==> 未指定 --service。托管二选一：
  pm2 start dist/boot.js --name wtc && pm2 save
  或 systemd：sudo bash deploy/install.sh --service（重复执行仅装服务）
EOF
fi
echo "==> 完成。检查：curl -sI http://127.0.0.1:3000/api/auth/google/config"
