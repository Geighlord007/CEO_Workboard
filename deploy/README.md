# WTC 自部署（服务器）说明

> 适用于一台常开 Linux 服务器（Ubuntu/Debian 示例）。完整手册见 `crm-prd/15-部署与运维手册.md`。

## 0. 前置
- Node.js ≥ 20 与 npm
- MySQL 兼容库（MySQL 8 / MariaDB / TiDB），建好空库：`wtc`（utf8mb4）
- （可选）域名 + 已解析

## 1. 拿代码
```bash
git clone <你的仓库地址> /opt/wtc && cd /opt/wtc
git checkout main          # 部署用 main（已合并 CRM）
```

## 2. 环境变量（创建 .env，仓库根）
```bash
cat > .env <<'EOF'
# 生产必需
APP_SECRET=<openssl rand -hex 32>
DATABASE_URL=mysql://user:pass@127.0.0.1:3306/wtc?ssl={}
# 推荐：Google 登录（第一个邮箱=总助admin，其余=user 只读）
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
ALLOWED_EMAILS=you@company.com,ceo@company.com
# 可选：AI 指令助手
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=sk-xxxx
LLM_MODEL=deepseek-v4-flash
EOF
chmod 600 .env
```
> 不想用 Google 登录：可稍后用 `npx tsx scripts/make-user.ts <email> admin` 生成会话并手工把 cookie 放进浏览器（仅开发场景；服务器上请优先 Google 登录）。

## 3. 一键安装（依赖+构建+建表+可选种子；服务由 pm2 或 systemd 拉起）
```bash
sudo bash deploy/install.sh            # 首次
# 想要演示数据：sudo bash deploy/install.sh --seed-crm
# 想顺便装成 systemd 服务：sudo bash deploy/install.sh --service
```

## 4. 账号
- 走 Google 登录：.env 的 `ALLOWED_EMAILS` 第一个=admin(总助)，其余=user(CEO 只读，界面只读+写接口403)。
- 纯开发账号：`npx tsx scripts/make-user.ts you@x.com admin`（生成 .cookie-* 文件，非服务器常规用法）。

## 5. HTTPS（手机访问必做）
```bash
cp deploy/nginx-wtc.conf.example /etc/nginx/conf.d/wtc.conf   # 改域名
sudo certbot --nginx -d wtc.example.com
sudo nginx -s reload
```

## 6. 自检
```bash
curl -sI https://<host>/api/auth/google/config      # 200
# 打开 https://<host>/      旧看板
# 打开 https://<host>/crm   CRM（admin 全功能 / user 只读）
```

## 7. 备份（务必）
```bash
# cron 每日
mysqldump -u root wtc | gzip > /backup/wtc-$(date +%F).sql.gz
```

## 8. 升级
```bash
cd /opt/wtc && git pull && npm ci && npm run build
# 若有 schema 变更：先备份再 npm run db:push
sudo systemctl restart wtc   # 或 pm2 restart wtc
```
