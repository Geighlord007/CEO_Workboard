# 每周任务控制台 · CloudBase 部署指南（腾讯云开发）

把整个系统部署到**腾讯云开发 CloudBase**，全链路国产化、免翻墙：

| 组件 | 用什么 | 费用 | 说明 |
|---|---|---|---|
| 前端 + 后端（一个容器） | **云托管 Cloud Run** | 免费额度内够用 | 直接用现成 Dockerfile，单容器跑 Hono 后端 + 托管前端静态产物 |
| 数据库 | **云开发 MySQL（TDSQL）** | 免费额度 | 标准 MySQL，Drizzle 直连 |
| 登录 | **邮箱 + 密码**（scrypt） | 免费 | 无需任何第三方；Google 可选 |

> 全程约 30 分钟。第 1~2 步是网页点选，第 3 步本地跑一条迁移命令，第 4 步网页部署。
> 中间任何一步报错，把红字贴回来即可。

---

## 准备：所需账号

1. **腾讯云账号**（已完成实名认证）→ https://cloud.tencent.com/
2. 一个 **Node.js ≥ 20** 的本地环境（用来跑建表迁移、灌演示数据）

---

## 第 1 步：创建云开发环境（约 3 分钟）

1. 打开云开发控制台：https://tcb.cloud.tencent.com/dev
2. 首次进入会引导「创建环境」，**地域务必选「上海」**（云托管当前支持地域为上海）；
3. 环境类型选免费/按量即可，创建完成后**记下「环境 ID」**（形如 `xxx-1gxxxxxx`），后面 CLI 部署要用。

---

## 第 2 步：初始化云开发 MySQL + 开启直连（约 5 分钟）

1. 控制台左侧进入「MySQL 数据库」，按提示**初始化数据库**（选一个私有网络 VPC，记下 VPC 名）；
2. 进入「数据库设置」→「**直连服务**」→ 点「**开启**」，系统会生成两个地址：
   - **内网地址**：只能被云托管/云函数访问（生产用这个）
   - **外网地址**：任意网络可访问（本地跑迁移用这个）
3. 在「账号管理」创建数据库账号（或用默认 root）并设置密码；
4. 拼出连接串（用户名、密码里的特殊字符记得 URL 编码）：

```
mysql://<用户名>:<密码>@<地址>:3306/tcb
```

> `/tcb` 是数据库名。迁移脚本会自动建表。

---

## 第 3 步：本地跑迁移 + 灌演示数据（约 10 分钟）

**注意：这一步要用第 2 步的「外网地址」**（本地电脑连不到内网地址）。

```bash
cd app-cloudbase

# 1. 生成会话密钥
openssl rand -hex 32        # 复制输出（Windows 没有 openssl 就用 PowerShell 见下方）

# 2. 填配置
cp .env.production.example .env.production
# 编辑 .env.production，填入：
#   ADMIN_EMAIL            = 你的邮箱（第一个管理员）
#   ADMIN_INITIAL_PASSWORD = 一个初始密码（首次登录用，之后可改）
#   ALLOWED_EMAILS         = 你和老板邮箱，逗号分隔（第一个是管理员）
#   APP_SECRET             = 刚生成的密钥
#   DATABASE_URL           = 第 2 步拼的「外网地址」连接串

# 3. 把 .env.production 的变量读进当前会话
#    Windows PowerShell：
Get-Content .env.production | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
  }
}
#    Linux/macOS：
#    set -a; source .env.production; set +a

# 4. 建表 + 灌演示数据
npm install
npm run db:push
npx tsx db/seed.ts          # 看到"完成：历史任务…"即成功
```

> Windows 生成密钥替代命令（PowerShell）：
> `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })`

---

## 第 4 步：部署到云托管（约 10 分钟）

### 方式 A：控制台「本地代码部署」（推荐，最省事）

1. 打开部署入口：https://tcb.cloud.tencent.com/dev#/platform-run/service/create?type=package
2. 配置如下：
   - **代码包类型**：选「文件夹」
   - **代码包**：选择本项目目录 `app-cloudbase` 上传（**不要**把 `node_modules`/`dist`/`.git` 打包进去，平台会在线构建）
   - **端口**：填 `3000`
   - **Dockerfile 目录**：留空（在根目录）
   - **Dockerfile 名称**：`Dockerfile`
3. 点「部署」，等待构建完成。

### 方式 B：CLI 一键部署（适合以后反复更新）

```bash
npm i -g @cloudbase/cli
tcb login                                   # 浏览器扫码授权
tcb cloudrun deploy -e <环境ID> -s wtc --port 3000 --source .
```

> 部署完成后，在云托管服务「概览」页拿到默认域名（形如 `https://xxx-xxxxx.app.tcloudbase.com`）。

### 方式 C：用 AI 助手部署（Claude Code / Kimi Code）

如果你平时用 Claude Code 或 Kimi Code，可以装 CloudBase 官方 AI 插件，让 AI 直接
帮你建环境、初始化 MySQL、部署云托管（插件自带 MCP 工具 + 部署知识）：

```bash
# Claude Code：一键装到本机检测到的 AI 工具；只想装 Claude Code 时加 --target claude-code
npx plugins add TencentCloudBase/cloudbase-plugin -y --scope user --target claude-code

# Kimi Code：在插件市场 /plugins 里搜 cloudbase 安装（来源 TencentCloudBase/CloudBase-MCP）
```

装好后，在 Claude Code / Kimi Code 里把下面这段话 + 本指南一起丢给 AI：

```
帮我把当前项目部署到腾讯云开发 CloudBase：
1) 建环境（地域上海）
2) 初始化 MySQL 数据库并「开启直连服务」，拿到内网 + 外网两个地址
3) 本地用外网地址跑 npm run db:push 和 npx tsx db/seed.ts
4) 用云托管部署本目录，端口 3000；环境变量按 .env.production.example 填，
   DATABASE_URL 生产改用内网地址，并开启私有网络（选 MySQL 所在 VPC）
5) 首次登录用 ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD
```

> 注意：AI 插件仍需你本人完成 CloudBase 登录授权（扫码 / API Key），它只是替你在
> 控制台操作；本指南里的关键坑（外网/内网区分、端口 3000、开私有网络）务必连同一起
> 给 AI，避免它踩错地址。

---

## 第 5 步：配置环境变量 + 开私有网络（约 5 分钟）

进云托管 → 你的服务 →「服务配置」：

1. **环境变量**逐个添加（对应 `.env.production` 的内容）：

   ```
   NODE_ENV=production
   APP_SECRET=...
   DATABASE_URL=mysql://...   ← 这里改用「内网地址」！
   ALLOWED_EMAILS=...
   ADMIN_EMAIL=...
   ADMIN_INITIAL_PASSWORD=...
   LLM_BASE_URL=https://api.deepseek.com/v1   (可选)
   LLM_API_KEY=sk-...                          (可选)
   LLM_MODEL=deepseek-chat                     (可选)
   ```

2. **网络配置 → 开启「私有网络」**，选择第 2 步初始化 MySQL 时选的 **VPC**——
   这样容器才能通过内网地址连到云开发 MySQL（生产务必用内网，更快更安全）。

3. 保存后平台会自动重新部署/重启实例。

> **关键点**：本地迁移用「外网地址」，生产运行用「内网地址」。两个地址只是 host 不同，库是同一个，数据不会丢。

---

## 第 6 步：首次登录并设置密码（2 分钟）

1. 浏览器打开云托管默认域名 → 跳到登录页；
2. 输入 **ADMIN_EMAIL** + **ADMIN_INITIAL_PASSWORD** → 登录成功；
3. 登录后该邮箱的密码哈希已写入数据库，**以后用它自己设的密码登录**。

> 安全建议：首次登录后，把云托管环境变量里的 `ADMIN_INITIAL_PASSWORD` 删掉/改掉，
> 这样即使泄露初始化密码也无法再登录（数据库里已是新密码）。

---

## 日常更新（以后每次改代码）

```bash
cd app-cloudbase
# 改完代码后：
tcb cloudrun deploy -e <环境ID> -s wtc --port 3000 --source . --force --yes --wait
```

数据在云开发 MySQL 里，重新部署不清数据。也可以把代码推到 Gitee/GitHub 私有仓库，
在云托管用「Git 仓库部署」绑定，之后 `git push` 即自动上线。

---

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 登录页显示「该账号尚未设置密码」 | 首次登录要用 ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD；确认云托管变量与迁移时一致 |
| 提示「邮箱不在名单内」 | `ALLOWED_EMAILS` 里没这个邮箱；改云托管变量后重新部署 |
| 页面能开但数据空/报错 | `DATABASE_URL` 错，或没开私有网络、地址用错（本地迁移用外网、生产用内网） |
| 部署后容器起不来/一直重启 | 端口没配对：控制台端口应填 `3000`；日志里看报错 |
| 本地迁移连不上数据库 | 用了内网地址；本地要用「外网地址」 |
| 想用 Google 登录 | 可选：在云托管变量加 `GOOGLE_CLIENT_ID` 即可（登录页会多出一个 Google 按钮） |

---

## 安全清单

- [ ] `.env.production` 不进 git / 不进镜像（已在 .gitignore / .dockerignore）
- [ ] `ADMIN_INITIAL_PASSWORD` 首次登录后从云托管删掉/改掉
- [ ] 云开发 MySQL 直连「外网地址」在本地迁移完成后，可在控制台关闭（可选，更安全）
- [ ] `ALLOWED_EMAILS` 只放可信邮箱
- [ ] 老板只拿 `/r/<令牌>` 只读链接，不给登录权限
