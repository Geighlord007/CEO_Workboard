# 每周任务控制台 · WTC（CEO_Workboard）

面向个人 / 小团队（合成生物初创「总助 + CEO」双角色）的**看板 + CRM 一体化工作台**：
一张看板管周任务、日历、关键节点、风险、BD 客户推进、供应商推进，并可一键生成只读「老板周报链接」；
一个 CRM 统一管理**客户 / 顾问 / 合作方 / 供应商 / 投资人**五类关系。

全链路部署在**腾讯云开发 CloudBase**（云托管 + 云开发 MySQL），邮箱 + 密码登录，登录页无第三方平台痕迹。

---

## 功能一览

### 看板（执行层）
- **周任务**：按业务线（BD / 战略与市场调研 / 供应商协调 / CEO 支持）编排本周与下周任务，支持优先级、截止日、编辑、关联文档链接；带截止日的任务自动进日历
- **日历 / 今日日程**：会议、里程碑、截止日、出差；月历红点 + 今日时间线
- **关键节点**：董事会、投标截止等倒计时，可增删改
- **客户推进 / 供应商推进**：看板卡片直接推进阶段、归档，与 CRM 同一份数据
- **风险与阻塞**、**习惯可视化**（12 周热力图 / 趋势 / 收工散点）、**快捷入口**
- **AI 指令助手**：一句话改看板（白名单步骤预览 → 单事务执行，破坏性操作红字标注）
- **老板周报**：`/r/<令牌>` 公开只读聚合页

### CRM（关系层，`/crm`）
- **统一「关系」列表**：5 类关系（客户 / 顾问 / 合作方 / 供应商 / 投资人）+ 进行中 / 历史切换
- **自动归档**：关系走到「终态」（签约 / 输单 / 放弃等）自动沉入历史，可恢复
- 客户侧承载「商机、样品、跟进」，供应商侧承载「询价、样品、质量事件」，融资侧承载「投资人阶段流」

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 · TypeScript · Vite 7 · TailwindCSS(shadcn) · TanStack Query |
| 后端 | Hono（API + 静态托管同端口） · tRPC v11 · superjson |
| 数据 | 云开发 MySQL（TDSQL，MySQL 兼容） · Drizzle ORM · mysql2 |
| 认证 | 邮箱 + 密码（Node scrypt）→ JWT 会话 cookie；Google 可选 |
| 字体 | Fontsource 自托管（IBM Plex Mono / DotGothic16），不依赖被墙的 Google Fonts |

> Google 登录为可选：登录页启动时请求后端 `GET /api/auth/google/config` 再渲染按钮，
> Client ID 不烘焙进前端产物；国内部署默认纯邮箱密码登录。

---

## CRM 关系模型（v0.3）

5 类关系，🟢 进行中 / 🔴 终态（自动归档）：

| 关系类型 | 进行中阶段（按顺序） | 终态（自动归档） |
|---|---|---|
| 客户 Client | 潜在 → 跟进中 → 已成交 | 停用 / 输单 |
| 顾问 Consultant | 候选 → 接触洽谈 → 合作中 | 聘期结束 / 未谈成 |
| 合作方 Partner | 候选评估 → 洽谈方案 → 合作中 | 合作结束 / 放弃 |
| 供应商 Supplier | 询价中 → 比价中 → 已准入 | 本轮弃用 / 淘汰停用 |
| 投资人 VC | 初步接触 → 材料已发 → 路演 → 尽调 → 条款谈判 → 交割中 | 投资完成 / 婉拒 / 放弃 |

- **客户与供应商分开**：底层三张表 —— accounts（客户/顾问/合作方）、suppliers（供应商）、investors（投资人）
- **单据层与关系层分开**：商机 / 询价 / 样品各自走流程，只有「关系本身」进入终态才触发归档
- 每条记录埋 **外部来源 + 外部 ID** 字段，为将来 Airtable / Google Sheets **双向同步**（外部为源、看板改动回写）留接口

完整设计见本地 PRD 工作区 `../crm-prd/18-关系模型-v0.3.md`（与本项目平级，独立维护）。

---

## 本地开发

需要 Node.js ≥ 20。

```bash
cp .env.example .env     # 填入 ADMIN_EMAIL / DATABASE_URL 等
npm install
npm run dev              # http://localhost:3000
```

### AI 指令助手（可选）

自然语言改看板（「本周任务全部标完成」「记个任务：BD 跟进华电合同，周五前」）。
需要 OpenAI 兼容模型服务（DeepSeek / Kimi / OpenAI 等），`.env` 配三项：

```bash
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-xxxxxxxx
LLM_MODEL=deepseek-chat
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发 |
| `npm run check` | TypeScript 全量类型检查 |
| `npm run build` | 生产构建：前端 → `dist/public`，后端 → `dist/boot.js` |
| `npm run db:push` | 将 schema 推送到数据库（Drizzle） |
| `npx tsx db/seed.ts` | 灌演示数据 |

## 部署（腾讯云开发 CloudBase）

完整图文步骤见 **[部署指南-CloudBase.md](./部署指南-CloudBase.md)**。
核心流程：建环境 → 开云开发 MySQL（直连）→ 本地迁移 → 云托管部署 → 配环境变量 → 首次登录。

> 旧版 GCP / Zeabur 方案见 `部署指南-国内版.md`（备用参考）。

## 代码仓库（GitHub）

- 私有仓库：`Geighlord007/CEO_Workboard`（本目录即其工作副本）
- 约定：每次「改代码 → 构建 → 部署」后自动 `git push`，GitHub 与线上保持一致

## 目录结构

```
api/          Hono/tRPC 后端（认证、看板与 CRM 各 router、DB 连接）
contracts/    前后端共享类型与常量（含 CRM 关系模型常量）
db/           Drizzle schema、relations、种子数据、migrations
src/          前端（页面、组件、hooks、providers）
部署指南-CloudBase.md   部署与运维手册
```

> 注：CRM 产品需求文档在项目平级目录 `../crm-prd/`（含 18-关系模型-v0.3.md），独立于本仓库维护。

## 版本记录

- **v1.4（CRM 关系框架）** — 统一 5 类关系模型：accounts 加关系类型 + 扩展阶段、suppliers 加阶段、新增 investors；自动归档；统一「关系」列表页 + 客户/供应商推进卡（看板与 CRM 同源可编辑）；主页 CRM 入口
- **v1.3（看板增强）** — 任务可编辑（标题/截止日期）、关键节点可增删改、带截止日任务进日历、AI 按钮放大
- **v1.2（CloudBase 版）** — 适配腾讯云开发：数据库连接模式 `default`、字体自托管（去 Google Fonts）、邮箱密码登录为主、新增部署指南
- **v1.1** — 新增 AI 指令助手（可选 LLM）
- **v1.0** — 首个自部署版本（Google 登录运行时下发、清理脚手架）
