# 每周任务控制台 · WTC（WorkBoard · CloudBase 版）

面向个人/小团队的每周任务与周报工作台：**邮箱 + 密码登录**（可选 Google），一张看板管理
周任务、日历与里程碑倒计时、风险与阻塞、BD 客户 pipeline、便签、
每日打卡与收工时间，并可一键生成**只读「老板周报链接」**。

单租户、全链路部署到**腾讯云开发 CloudBase**（云托管 + 云开发 MySQL），登录页无任何第三方平台痕迹。

## 功能一览

- **周任务**：按业务线（BD 拓展 / 战略与市场调研 / 供应商协调 / CEO 支持）编排本周与下周任务，支持优先级、截止日、关联文档链接
- **日历**：会议 / 里程碑 / 截止日 / 出差，月历红点 + 今日日程
- **关键节点**：董事会、投标截止等倒计时
- **风险与阻塞**：红灯项清单，可标记「需要谁支持」
- **BD pipeline**：初谈 → 方案 → 报价 → 签约
- **习惯可视化**：近 12 周完成热力图、完成趋势、收工散点
- **AI 指令助手**：点右下角「✦ AI 指令」，用一句话改看板——助手把指令解析成可预览的步骤（破坏性操作红字标注），确认后单事务整体执行
- **老板周报**：`/r/<令牌>` 公开只读聚合页，令牌可随时轮换

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 · TypeScript · Vite 7 · TailwindCSS(shadcn 主题) · TanStack Query |
| 后端 | Hono（API + 静态托管同端口） · tRPC v11 · superjson |
| 数据 | 云开发 MySQL（TDSQL，MySQL 兼容） · Drizzle ORM · mysql2 |
| 认证 | 邮箱 + 密码（Node 内置 scrypt 哈希）→ JWT 会话 cookie；Google 可选 |
| 字体 | Fontsource 自托管（IBM Plex Mono / DotGothic16），不依赖被墙的 Google Fonts |

> 登录 Client ID **不烘焙进前端产物**：Google 登录为可选能力，登录页启动时请求后端
> `GET /api/auth/google/config`（后端读 `GOOGLE_CLIENT_ID`）再渲染按钮。
> 因此国内部署默认不配 `GOOGLE_CLIENT_ID` 即可，纯用邮箱密码登录。

## 本地开发

需要 Node.js ≥ 20。

```bash
cp .env.example .env     # 填入 ADMIN_EMAIL / DATABASE_URL 等（见文件内注释）
npm install
npm run dev              # http://localhost:3000
```

### AI 指令助手（可选）

用自然语言改看板（如「本周任务全部标完成」「记个任务：BD 跟进华电合同，周五前」）。
入口在首页右下角 **✦ AI 指令**：先解析为可预览的步骤，确认后由后端在**单个事务**内整体执行——任一步失败即整体回滚，不会留下半途状态。

命令理解需要一个 **OpenAI 兼容**的模型服务（DeepSeek / Kimi / OpenAI / 本地 vLLM 等均可），在 `.env`（或生产环境变量）里配置三项，不配置则该入口点击后会提示先配置：

```bash
LLM_BASE_URL=https://api.deepseek.com/v1      # 任意 OpenAI 兼容 base url（末尾不带 /）
LLM_API_KEY=sk-xxxxxxxx
LLM_MODEL=deepseek-chat
```

可理解为「指令 → 白名单操作」的翻译器：LLM 只能产出受支持的操作类型，涉及既有数据的 id 一律取自服务端提供的真实上下文，编造/不支持的输出会被拦截。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发（Vite + Hono dev server） |
| `npm run check` | TypeScript 全量类型检查（`tsc -b`） |
| `npm run build` | 生产构建：前端 → `dist/public`，后端 → `dist/boot.js` |
| `npm run start` | 以生产模式启动（需注入 `APP_SECRET` / `DATABASE_URL` 等环境变量） |
| `npm run lint` | ESLint |
| `npm run db:push` | 将 schema 推送到数据库（Drizzle） |
| `npx tsx db/seed.ts` | 灌入演示数据（日期相对当天动态生成，可随时重跑） |

> 项目暂未包含单元测试；`vitest` 已就绪（`npm test`），后续补用例即可。

## 部署（腾讯云开发 CloudBase）

完整图文步骤见 **[部署指南-CloudBase.md](./部署指南-CloudBase.md)**（约 30 分钟）。
核心流程：建云开发环境 → 初始化云开发 MySQL 并开启直连 → 本地跑迁移（外网地址）→
云托管部署本目录 → 配环境变量 + 开私有网络（内网地址）→ 首次登录。

> 旧版 GCP（Cloud Run + TiDB）与 Zeabur 方案见仓库外的 `部署指南-国内版.md`（备用参考）。

## 目录结构

```
api/          Hono/tRPC 后端（认证、各业务 router、DB 连接）
contracts/    前后端共享类型与常量
db/           Drizzle schema、relations、种子数据
src/          前端（页面、组件、hooks、providers）
部署指南-CloudBase.md   部署与运维手册（CloudBase）
```

## 版本记录

- **v1.2（CloudBase 版）** — 适配腾讯云开发：数据库连接模式改为 `default`（标准 MySQL）；
  字体改为 Fontsource 自托管（去掉被墙的 Google Fonts）；新增 `部署指南-CloudBase.md`；
  清理 GCP 专属文件（deploy.sh / cloudbuild.yaml / 部署指南.md）。
- **v1.1** — 新增 AI 指令助手（可选 LLM）：一句话指令 → 白名单步骤预览 →
  单事务整体执行；`.env.example` / README 补充 LLM_* 配置说明。
- **v1.0** — 首个自部署版本：修复 Google 登录 Client ID 改为运行时下发；
  清理脚手架模板残留；README 补全。
