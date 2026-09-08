# AGENTS.md · WTC 每周任务控制台（CEO_Workboard）

> 给 Agent 的工作须知：**这是什么、怎么改才不闯祸**。
> 详细设计不在此重复：产品功能看 `README.md`，设计决策看仓库外 `../crm-prd/`，真源是 `db/schema.ts`、`contracts/*`、`api/*Router.ts`。

## 1) 项目速览

个人/极小团队（总助 admin 可写 + CEO 只读）的看板 + CRM。页面：`/` 看板、`/crm` 业务系统（五个模块：**业务 / 采购 / 融资 / 人脉 / 情报** + 报表）、`/data` 数据浏览(仅 admin)、`/login`、`/r/:token` 老板周报。

```
api/          后端：boot(入口+静态托管) / 各 *Router(tRPC) / lib / queries（DB）
contracts/    前后端共享类型与常量：crm.ts（阶段流+中英标签）、commands.ts（AI 指令白名单）
db/           schema.ts = 数据库唯一真源；migrations/*.sql 被 gitignore
src/pages/    页面壳（CrmPage = 五模块导航）
src/components/
  table/      DataTable.tsx = 通用表格（搜索/筛选/排序/列控制/行内编辑/批量/分页/导出CSV/详情抽屉）
  modules/    六张业务表页：CustomersTable / OpportunitiesTable / SuppliersTable / InvestorsTable /
              PeopleTable / CompaniesTable / FundingEventsTable
  crm/ dash/  既有 CRM 组件与看板卡片；ui/ = shadcn 基础组件
```

数据表要点：运营表 `accounts / contacts / suppliers / investors / opportunities`；情报表 `company_library / funding_events`（公司档案+融资事件，界面一体化：公司行为主、融资时间线内嵌）。

要改数据模型 → 先读 `db/schema.ts`；要加/改接口 → 看 `api/*Router.ts`；阶段/角色/外联状态标签只在 `contracts/crm.ts` 一处改（中英双语都在那里）。

## 2) 硬性规则（违反 = 闯祸）

1. **密钥不进仓库**。部署变量（APP_SECRET / DATABASE_URL / 管理员账号 / 腾讯云 SECRET_ID|KEY / LLM_KEY / SYNC_TOKEN）只在仓库外 `../cloudbase-setup/` 与运行时环境变量；只报变量名，不复述值。
2. **当前阶段：只做本地，不碰云**。本地库是便携版 MariaDB（`C:\Users\Windows11\wtc-db`，`DATABASE_URL=mysql://root@127.0.0.1:3306/wtc`）。CloudBase 免费额度用尽、环境隔离中；**用户明确说上线前不得部署**（不跑 `redeploy.mjs`、不动 `app-cloudbase-deploy`）。
3. **数据库方言差异**：云端 TDSQL(MySQL 5.7) 用 `DEFAULT CURRENT_TIMESTAMP`（`DEFAULT (now())` 不兼容）；本地 MariaDB 还需把 drizzle 生成的 `serial AUTO_INCREMENT` 改成 `int NOT NULL AUTO_INCREMENT`。应用顺序见 `../cloudbase-setup/local-apply-migrations.mjs`（0000–0007）。改 schema 一律：改 `db/schema.ts` → 手写/生成 SQL → `apply-sql.mjs` 应用 → 回读验证。
4. **权限模型**：写操作只过 `adminWrite`（`role='admin'`）。"点编辑没反应"先查 `users.role`。单租户、无数据隔离。
5. **本地免登录**：`/api/auth/dev-login` 只在 vite dev（`import.meta.mode === 'development'`）注册，前端 `useAuth` 在 DEV 下自动调用。**不要把判断改回只看 `NODE_ENV`**——本机全局 `NODE_ENV=production`，会误判并抢 3000 端口（EADDRINUSE、改 API 就崩）。守卫函数 `viteDevMode()` 在 `api/boot.ts`。
6. **表格页统一用 `DataTable`**：列配置 `Column<T>`（zh/en 双语表头、type、options、editable、filterable、hiddenByDefault、render、exportValue）；行内编辑走 `onCellEdit` → 对应 `*.update`；内部字段（id/importNote/externalSource/nameNormalized/时间戳）默认 `hiddenByDefault`。新增可编辑字段时**三处都要改**：`db/schema.ts`、`api/*Router.ts` 的 `patch` zod、`api/dataRouter.ts` 的白名单。
7. **样式纪律**：`--n-accent` 是语义红（危险/逾期），勿当品牌色；动画只用 `transform/opacity/filter`；两套主题都要照顾。
8. **读取纪律**：未明确要求前禁止全库递归读取；先 grep/单文件/目录列表定向。
9. **完成门槛**：改 TS 先 `npm run check`；改前端再 `npm run build`；别留孤儿 import/参数（tsc 严格）。改完本地起服务自测接口（见 §5）。

## 3) 同意 vs 已授权

**已授权，直接做**
- 本地迭代：改代码 → `npm run check` → `npm run build` → git 提交/push（push 前确认无密钥）
- 本地数据库：应用已写好的迁移、跑导入/清洗脚本（`cloudbase-setup/*.mjs`）、白名单内数据小改
- 读任何文件、`npm run dev`、本地接口自测

**先征得用户同意**
- **任何云端操作**（部署/改云端环境变量/云端库结构）
- 结构性改 schema、新建表、删除数据
- 涉及产品方向/领域模型（关系类型、阶段流、情报层边界）——先记入 `../crm-prd/` 再动代码

## 4) 按需查哪

| 想搞清楚 | 打开 |
|---|---|
| 表字段 / 枚举 | `db/schema.ts` |
| 阶段流/中英标签/角色/外联状态 | `contracts/crm.ts` |
| 五模块页面与列顺序 | `src/components/modules/*.tsx` |
| 通用表格能力 | `src/components/table/DataTable.tsx` |
| 数据页（原始表浏览/编辑白名单） | `api/dataRouter.ts` + `src/pages/DataPage.tsx` |
| 商机概率/业务规则 | `api/crmRouter.ts` |
| AI 指令白名单 | `contracts/commands.ts` |
| 旧表来源与导入映射 | `../WTC-各表结构提案-v3.md`、`../WTC-数据量核对表.md`、`../data-audit/` |
| 本地环境/数据库 | `../启动本地环境.ps1`、`../数据库使用入门.md` |

## 5) 快捷命令

```bash
npm run dev      # 本地 http://localhost:3000（DEV 免登录；需先起本地 MariaDB）
npm run check    # 类型检查（改完必跑）
npm run build    # 生产构建

# 本地数据库（若未运行）
& 'C:\Users\Windows11\wtc-db\mariadb-10.11.19-winx64\bin\mysqld.exe' --datadir='C:\Users\Windows11\wtc-db\data' --port=3306 --bind-address=127.0.0.1

# 迁移 / 数据脚本（在 ../cloudbase-setup/ 下，需 DATABASE_URL）
$env:DATABASE_URL='mysql://root@127.0.0.1:3306/wtc'
node apply-sql.mjs ../app-cloudbase/db/migrations/000X_xxx.sql
node import-all.mjs      # 从 ../data-audit/import-ready/ 重建运营+情报数据
node normalize-memo.mjs  # memo 拆字段清洗（幂等）
node smoke-api.mjs       # 8 个接口冒烟（BASE=http://localhost:3000）
```

_文档与代码冲突时以代码为准，并回改文档。_
