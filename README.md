# 每周任务控制台 · WTC（CEO_Workboard）

面向个人 / 小团队（合成生物初创「总助 + CEO」双角色）的**看板 + CRM 一体化工作台**：
一张看板管周任务、日历、关键节点、风险与 BD 推进，并可一键生成只读「老板周报链接」；
一个 CRM 按**五个模块**统一管理全部业务关系与情报。

**当前阶段**：本地开发 + 本地数据库（便携 MariaDB）；云端（腾讯云 CloudBase）因免费额度用尽被隔离，**上线前暂停部署**。

---

## 功能一览

### 看板（执行层）
- **周任务**：按业务线编排本周/下周任务，优先级、截止日、关联文档；带截止日自动进日历
- **日历 / 今日日程**、**关键节点**、**客户推进 / 供应商推进**、**风险与阻塞**、**习惯可视化**（12 周热力图 / 趋势 / 收工散点）、**快捷入口**
- **AI 指令助手**：一句话改看板（白名单步骤预览 → 单事务执行）
- **老板周报**：`/r/<令牌>` 公开只读聚合页

### CRM（业务层，`/crm`）—— 五个模块

| 模块 | 内容 | 默认列顺序（前几列一眼抓重点） |
|---|---|---|
| **业务** | 客户 / 合作方 + 商机 + 跟进 + 样品 | 客户表：公司名 → 类别 → 成熟度 → 行业 → 做什么 → 合作内容 → 底盘/技术 → 进度 → 联系人 → 职级 → 联系方式 → 下次动作 → 备注 |
| **采购** | 供应商 | 名称 → 类别 → 阶段 → **NDA** → 能力 → 金额 → 开始/结束 → 账期 → 风险 → 联系人 → 最近反馈 |
| **融资** | 投资人/基金（按轮次） | 机构名 → 轮次 → 阶段 → 赛道 → 地区 → 偏好/支票 → **首次接触 → 最近沟通 → 沟通记录 → 下一步** → 对接人 → 职级 → 邮箱/验证 → 引荐人 → 备注 |
| **人脉** | 人（顾问/高管/学术/销售/投资人/候选池） | **方向标签** → 姓名 → 角色 → 机构 → 职位 → 邮箱/领英 → 引荐人 → 外联状态 → 最近联系 → 备注 |
| **情报** | 公司档案 + 融资事件 | 公司名 → 国家 → 赛道 → 行业 → 成立年 → 最近轮次/日期 → 轮次明细 → 上市/被收购 → **累计融资** → 官网/CB → 简介（点开看每轮融资时间线） |
| 报表 | 周报 / 看板聚合 | — |

所有表格由同一个 **通用表格组件**（`src/components/table/DataTable.tsx`）驱动：
搜索、多条件筛选、点列头排序、列显示/排序/宽度记忆、行内编辑、批量选择、分页/虚拟滚动、密度切换、**导出 CSV（当前筛选 / 全量）**、详情抽屉、空状态与加载骨架。
表头与枚举标签**中英双语**（`contracts/crm.ts`：`STAGE_LABELS` / `STAGE_LABELS_EN` / `CONTACT_ROLE_META` / `OUTREACH_STAGE_META`）。

`/data` 数据页（仅 admin）：任意表原始浏览，中文列名、内部字段默认隐藏、同样支持搜索/筛选/导出与白名单字段行内编辑。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 · TypeScript · Vite 7 · TailwindCSS(shadcn) · TanStack Query |
| 后端 | Hono（API + 静态托管同端口） · tRPC v11 · superjson |
| 数据 | **本地开发**：MariaDB 10.11（便携版，`C:\Users\Windows11\wtc-db`）· **生产**：云开发 MySQL(TDSQL) · Drizzle ORM · mysql2 |
| 认证 | 邮箱 + 密码（Node scrypt）→ JWT 会话 cookie；本地 dev 自动登录（`/api/auth/dev-login`，仅 vite dev 注册） |
| 字体 | Fontsource 自托管，不依赖 Google Fonts |

---

## 数据模型（v2 定稿）

**运营层**（日常跟进）：

| 关系类型 | 进行中阶段 | 终态（自动归档） |
|---|---|---|
| 客户 Client | 潜在 → 跟进中 → 已成交 | 停用 / 输单 |
| 合作方 Partner | 候选评估 → 洽谈方案 → 合作中 | 合作结束 / 洽谈未成 |
| 顾问 Consultant（个人顾问走「人脉」） | 候选 → 接触洽谈 → 合作中 | 聘期结束 / 未谈成 |
| 供应商 Supplier | 潜在·未接触 → 交流 → 询价 → NDA → 合同 → 执行中 | 合同结束 / 终止·弃用 |
| 投资人 Investor（每轮独立） | 待触达 → 初步接触 → 材料已发 → 路演 → 尽调 → 条款谈判 → 交割中 | 投资完成 / 婉拒 / 放弃 |
| 人脉（个人） | 待触达 → 已邀约 → 已约会议 → 推进交流 → 已签约 | 结束 |

**情报层**（只读参考，`company_library` + `funding_events`）：外部公司库（Crunchbase 等快照）与逐轮融资事件，公司行为主表、融资明细为子表，界面一体化（列表看汇总、点开看时间线）。预留 `cbUrl` 唯一键 + `snapshotDate`，供未来"每周自动更新 Agent"upsert。

> 完整设计见 `../WTC-各表结构提案-v3.md`、`../WTC-业务逻辑与架构重构方案-v2.md`、`../crm-prd/`。

---

## 本地开发

需要 Node.js ≥ 20 与本地 MariaDB（便携版，无需安装服务）。

```bash
# 1) 启动本地数据库（若未运行）
& 'C:\Users\Windows11\wtc-db\mariadb-10.11.19-winx64\bin\mysqld.exe' --datadir='C:\Users\Windows11\wtc-db\data' --port=3306 --bind-address=127.0.0.1

# 2) 启动应用
npm install
npm run dev              # http://localhost:3000 —— 本地免登录
```

或在项目根目录直接双击 `..\启动本地环境.ps1`（一键起数据库 + 应用）。

`.env` 关键项：`DATABASE_URL=mysql://root@127.0.0.1:3306/wtc`；云端连接串备份在 `../cloudbase-setup/.env.cloud-backup`。

### 重建数据（可选）

`../data-audit/import-ready/` 保存了全部导入预演 CSV，`../cloudbase-setup/` 下的脚本可一键重建：
`import-all.mjs → backfill-ab.mjs → backfill-ab2.mjs → normalize-memo.mjs → import-missing.mjs → update-supplier-locations.mjs`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发（免登录） |
| `npm run check` | TypeScript 全量类型检查（改完必跑） |
| `npm run build` | 生产构建：前端 → `dist/public`，后端 → `dist/boot.js` |
| `npm run db:generate` | 由 schema 生成迁移 SQL（需手工修正方言） |

## 部署（腾讯云开发 CloudBase · 暂停）

完整步骤见 **[部署指南-CloudBase.md](./部署指南-CloudBase.md)**。
**注意**：CloudBase 免费额度用尽、环境已被隔离（线上 503）。用户明确"项目完成、确认可上线前不部署"，因此本仓库当前不做云端发布；恢复时按 `../cloudbase-setup/redeploy.mjs` 流程执行。

## 代码仓库（GitHub）

- 私有仓库：`Geighlord007/CEO_Workboard`（本目录即其工作副本）
- 约定：改代码 → `npm run check` → `npm run build` → `git commit/push`；部署（将来恢复时）后同样 push

## 目录结构

```
api/          Hono/tRPC 后端（认证、看板与 CRM 各 router、数据页、DB 连接）
contracts/    前后端共享类型与常量（CRM 阶段流 + 中英标签、AI 指令白名单）
db/           Drizzle schema（唯一真源）、migrations/*.sql
src/pages/    页面壳（CrmPage = 五模块导航、DataPage = 数据浏览）
src/components/
  table/      DataTable 通用表格组件
  modules/    六张业务表页（客户/商机/供应商/投资人/人脉/公司档案+融资事件）
  crm/ dash/  既有 CRM 组件与看板卡片
```

## 版本记录

- **v2.0（五模块 + 情报层 + 旧表导入）** — CRM 重构为 业务/采购/融资/人脉/情报 五模块；新增通用表格组件（搜索/筛选/排序/列控制/行内编辑/批量/分页/导出 CSV/详情抽屉）与中英双语标签；新增 `company_library` + `funding_events` 情报层与公司档案一体化视图；投资人加「轮次/首次接触/沟通进展/引荐人」，供应商加「NDA/地区」，人脉升级为独立实体（可无机构挂靠、含候选池）；15 张旧表盘点→去重→字段归类导入（账户 259 / 人脉 1,781 / 供应商 45 / 投资人 819 / 公司库 3,239 / 融资事件 362 / 商机 10）；开发切换到本地 MariaDB 并支持免登录预览
- **v1.4（CRM 关系框架）** — 统一 5 类关系模型、自动归档、统一关系列表页与推进卡
- **v1.3（看板增强）** — 任务可编辑、关键节点可增删改、带截止日任务进日历、AI 按钮放大
- **v1.2（CloudBase 版）** — 适配腾讯云开发、字体自托管、邮箱密码登录、部署指南
- **v1.1** — AI 指令助手（可选 LLM）
- **v1.0** — 首个自部署版本
