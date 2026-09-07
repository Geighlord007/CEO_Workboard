# AGENTS.md

> 给 AI 编码助手 / 任何 Agent 的项目说明 —— 开始动手前先读这一页。
> 项目：**每周任务控制台 · WTC（CEO_Workboard）**。GitHub 私有仓库 `Geighlord007/CEO_Workboard`，本目录即仓库工作副本。

---

## 0) 铁律（违反会出事故）

1. **绝不把密钥写进代码 / README / AGENTS.md / 任何会被 git 跟踪的文件。**
   部署所需的环境变量（`APP_SECRET`、`DATABASE_URL`、管理员邮箱与初始密码、腾讯云 `SECRET_ID/SECRET_KEY`、`ENV_ID`）只存在于：
   - 本地部署脚本 `../cloudbase-setup/redeploy.mjs`（在仓库**外**、与源码平级、含硬编码值，勿复制进仓库）；
   - 运行时的 pwsh 环境变量（用完即弃）。
   向新 Agent 交代部署时，引用脚本与变量名即可，**不要复述具体值**。
2. **MySQL 是 5.7 兼容（云开发 TDSQL）**：8.0 语法 `DEFAULT (now())` 会直接报错，一律写成 `DEFAULT CURRENT_TIMESTAMP`；`drizzle-kit push` 在此库上不可靠，改 schema 走「generate → 手工修 SQL → apply」流程（见 §8）。
3. **验证通过才算完成**：任何改动至少过 `npm run check`（tsc -b）；前端改动再 `npm run build`；涉及线上的改动按 §7 部署并在**线上真实 URL** 验证后，`git push`。
4. **CRM 写操作只有 `role="admin"` 能做**（`adminWrite`）。新增账号/改动 auth 引导时确保 bootstrap 给管理员 `role: "admin"`；历史遗留的 `role="user"` 会造成「看板点编辑没反应」这类静默失败，先查用户角色。

---

## 1) 项目是什么

个人 / 极小团队（合成生物初创「总助 + CEO」双角色）的**看板 + CRM 一体化工作台**：

- 看板（`/`）：周任务、日历/日程、关键节点倒计时、风险阻塞、客户/供应商推进卡、习惯可视化、AI 指令助手、老板周报只读链接。
- CRM（`/crm`）：统一管理客户 / 顾问 / 合作方 / 供应商 / 投资人 5 类关系，终态自动归档；看板卡片与 CRM 是**同一份数据**（dashboard 直接改，不是只读副本）。
- 手机形态：PWA（可「安装到桌面」），`public/manifest.webmanifest` + `public/sw.js` + `public/icons/*`。
- 全链路部署在腾讯云开发 CloudBase（云托管容器 + 云开发 MySQL），HTTPS 直连。

> 代码形态超前于线上是允许的：本仓库是「事实上的最新」，是否已部署取决于最近一次 redeploy。
> 若线上还没有 PWA/霓虹 UI，那不是 bug —— 是那一版还没发。改完代码后线上 URL 的验证结果以实际 deploy 为准。

## 2) 技术栈与目录地图

| 层 | 选型 |
|---|---|
| 前端 | React 19 · TypeScript · Vite 7 · TailwindCSS(shadcn ui 组件) · TanStack Query · tRPC v11 客户端 |
| 后端 | Hono（API + 静态托管同一端口）· tRPC v11 + superjson |
| 数据 | 云开发 MySQL（TDSQL，5.7 兼容）· Drizzle ORM · mysql2（连接模式 `default`） |
| 认证 | 邮箱 + 密码（Node scrypt）→ JWT 会话 cookie；Google 可选 |
| 字体 | Fontsource 自托管：IBM Plex Mono / DotGothic16（**不引 Google Fonts**，国内可访问） |
| PWA | manifest + Service Worker（离线壳）+ 自绘 PNG 图标（纯 Node 脚本，零依赖） |

```
api/            Hono/tRPC 后端（boot.ts 组装、context、auth、各 router、queries、lib）
contracts/      前后端共享类型与常量（含 CRM 关系模型常量，如 STAGE_FLOW）
db/             Drizzle schema（schema.ts）、migrations（*.sql 已被 gitignore，需 apply）
src/            前端：pages（Home/CrmPage/Login/…）、components（dash/* 看板卡、crm/*、ui/* shadcn）
scripts/        一次性 Node 脚本（make-user、gen-icons 等）
public/         PWA：manifest.webmanifest、sw.js、icons/
dist/           构建产物（gitignore）：前端 dist/public + 后端 dist/boot.js
```

**gitignore 已排除**：`node_modules/`、`dist/`、`.env*`、`db/migrations/*.sql`、`dev-login.ts`。
**仓库外、勿纳入**：`../cloudbase-setup/`（部署/迁移脚本 + 硬编码密钥）、`../crm-prd/`（PRD 工作区，README 只引用不跟踪）。

## 3) 常用命令

```bash
npm run dev        # 本地 http://localhost:3000（Hono dev-server + Vite）
npm run check      # tsc -b 全量类型检查（改完代码必跑）
npm run build      # 生产构建：vite → dist/public；esbuild → dist/boot.js
npm run db:generate  # 按 schema 生成迁移 SQL（生成后必须修 DEFAULT (now())）
npm run lint / test  # eslint / vitest
node scripts/gen-icons.mjs  # 重新生成 PWA 图标（纯 Node，无需 npm 依赖）
```

## 4) CRM 领域模型（v0.3，改它先读 contracts/crm.ts）

- **5 类关系**：`client` 客户 / `consultant` 顾问 / `partner` 合作方 / `supplier` 供应商 / `investor` 投资人。
- **底层 3 张表**（客户与供应商分开）：`accounts`（client/consultant/partner）、`suppliers`、`investors`。
- **阶段流**集中在 `contracts/crm.ts`：`STAGE_FLOW[relType] = 进行中阶段[]`、终态 = 归档（`isArchivedStage`）；改阶段文案/顺序只动这一处。
- **自动归档**：关系走到终态（如 签约/输单/放弃）自动沉入历史列表，可恢复；只有「关系本身」进终态才归档，单据层（商机/询价/样品）流程独立。
- **同步预留**：accounts/suppliers/investors 都有 `externalSource` + `externalId`。将来做 Airtable/Google Sheets **双向同步**（外部为源、看板改动回写）时用，勿占用这两个字段存别的东西。
- 设计权威文档：`../crm-prd/18-关系模型-v0.3.md`（仓库外，先问再做大的模型改动）。

## 5) 后端模式

- `api/boot.ts` 组装一切：auth 端点、`/api/trpc/*` 由 fetchRequestHandler 接管、`/api/*` 兜底 404；生产模式 `serveStaticFiles` 托管 `dist/public`（SPA fallback 读 index.html，只对 Accept 含 text/html 的请求回 HTML）。
- 认证：cookie 会话 JWT（`jose`）。权限分两级：
  - `authedQuery`：任何登录用户可读；
  - `adminWrite`：仅 `role === "admin"` 可写（CRM 全部写操作走这里）。
- tRPC 结构：`api/router.ts` 汇总各 router（taskRouter / eventRouter / noteRouter / riskRouter / crmRouter(含 relationship 子路由) / reportRouter / aiRouter / activityRouter 等）。
- DB 访问：`api/queries/connection.ts` 连接池（mysql2 `default` 模式，避免加密插件问题）；Drizzle 只用于类型与 schema，**查询多走手写 SQL helper**，新查询请沿用现有风格。
- AI 指令助手：`api/aiRouter.ts` → plan（解析成步骤）+ execute（单事务执行，失败整批回滚）；破坏性步骤列表在 `contracts/commands.ts` 用 `DESTRUCTIVE_KINDS` 标注。

## 6) 前端模式（重要：设计语言是「深空霓虹 v2」，不是默认 shadcn 白）

- **主题切换**：`html[data-theme=dark|light]`，由 `index.html` 内联脚本在首屏前恢复，`src/hooks/useTheme.ts` 管理（T 键切换）。
- **设计令牌**（`src/index.css`）：
  - `--n-*`：语义层（bg/card/border/text/accent…）。注意 `--n-accent` 是**玫红语义色**（危险/逾期/错误），不要改成品牌渐变色，否则 CRM 逾期红线全变味；
  - `--nx-*`：霓虹品牌层（c1 青 / c2 靛 / c3 紫 / c4 粉；`--nx-grad` 渐变、`--nx-text-grad` 渐变字）。品牌主视觉一律用 `--nx-*`。
- **关键 class**：`.ncard`（玻璃卡 + 顶部霓虹发丝 + hover 辉光）、`.nbtn`（胶囊按钮）、`.nbtn-accent`（=主行动按钮，渐变）、`.nlabel`、`.font-dot`（点阵字体）、`.nx-brand`（渐变字，需配 `background-clip:text` 的透明色）、`.nx-logo`（呼吸辉光）、`.nx-page`/`.nx-tab-in`/`.nx-dock`/`.nx-install`（见下）。
- **动效纪律**：动画只改 `transform/opacity/filter`，背景光斑用 `position:fixed` 的 `body::before/::after`；尊重 `prefers-reduced-motion`（index.css 已有全局兜底）。新增动效别把整页布局动得卡顿。
- **移动端外壳**：`src/components/dash/MobileDock.tsx`（手机底部导航，≤760px 显示）、`src/components/InstallPwa.tsx`（安装引导条）；首页/CRM 根容器尾部放 `<div className="nx-dock-gap"/>` 占位。
- **PWA**：改完 `public/manifest.webmanifest` 或 `sw.js` 记得 bump `sw.js` 顶部 `VERSION`；图标源是脚本绘制（`scripts/gen-icons.mjs`），需要换图重跑脚本，产物在 `public/icons/`。
- 页面路由（`src/App.tsx`）：`/`（看板）、`/crm`、`/login`、`/r/:token`（公开周报）、`*`。

## 7) 部署流程（CloudBase 云托管）

源码目录：`app-cloudbase`（本仓库）→ 干净目录 `app-cloudbase-deploy`（排除 node_modules/dist/.git/.env*）→ redeploy。

```bash
# 1) 同步干净部署目录（脚本所在处每次执行即可）
robocopy app-cloudbase app-cloudbase-deploy /E /XD node_modules dist .git /XF .env .env.production .env.local *.log
# 2) 部署（仓库外的 cloudbase-setup/redeploy.mjs，manager-node SDK 直连）
cd ../cloudbase-setup
$env:SECRET_ID='...'; $env:SECRET_KEY='...'; $env:ENV_ID='...'
node redeploy.mjs      # 内部 EnvParams 硬编码了 APP_SECRET/DATABASE_URL/管理员账号，勿改坏
# 3) 验证（线上真实 URL，例：https://<env>-<id>.sh.run.tcloudbase.com）
#    HTTP 200 + 首页含 <link rel="manifest">；/manifest.webmanifest 200 且 content-type=application/manifest+json；
#    /sw.js、/icons/icon-192.png、/maskable-512.png 均 200
# 4) 收尾
git add -A && git commit -m "chore: deploy" && git push   # 仓库约定：每次部署后自动推送
```

部署前先本地冒烟：`npm run build` 后 `node dist/boot.js`（需设 NODE_ENV=production + 必需 env，可给假 DATABASE_URL 只看静态资源），再 curl 上述路由。

## 8) 数据库迁移（改 schema 的标准流程）

1. 改 `db/schema.ts`；
2. `npm run db:generate`（离线生成 `db/migrations/NNNN_*.sql`）；
3. **手工修 SQL**：把 `DEFAULT (now())` 全部替换为 `DEFAULT CURRENT_TIMESTAMP`（5.7 兼容）；确认分号前无 8.0 语法；
4. 执行：仓库外 `cloudbase-setup/apply-sql.mjs`（mysql2 读文件、按 `--> statement-breakpoint` 拆分逐条执行），或手动在 DB 客户端里跑；
5. 不要在未 apply 前重启服务依赖新列；加表/加列后可用 `test-conn.mjs` 快速自检。

## 9) 高频坑位备忘

- 「编辑不生效 / 按钮点了没反应」→ 先查 `users.role` 是否 admin（§0.4），不是就去查前端是否静默吞了 403。
- `DEFAULT (now())` 报错 → 见 §0.2 / §8。
- 看板卡片在手机上自动单列堆叠（`useStacked`，宽 <1150px 或高 <730px），别在桌面 12 列网格上做依赖固定列号的布局。
- 新增中文文案直接写中文即可；本项目 UI 双语文案并存（大标签英文、正文中文），保持风格统一。
- `tsc -b` 对未使用变量/参数严格（`noUnusedLocals/Parameters`），改完别留孤儿 import。
- crm-prd 与 cloudbase-setup 都不要加进 git；用户已明确「不用」。

_最后一条：如果你不确定某处现状，先读代码/README/相关 router 再改，别猜。_
