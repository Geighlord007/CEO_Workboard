# AGENTS.md · WTC 每周任务控制台（CEO_Workboard）

> 给 Agent 的工作须知，只回答两件事：**这是什么、怎么改才不闯祸**。
> 详细设计不在这里重复：产品功能看 `README.md`，设计决策看仓库外 `../crm-prd/`，数据/代码真源是 `db/schema.ts`、`contracts/*`、`api/*Router.ts`。查得到的东西别在此展开。

## 1) 项目速览

个人/极小团队（总助 + CEO 双角色）的看板 + CRM 一体化工具。总助=admin（可写），CEO=user（只读）。页面：`/` 看板、`/crm` CRM、`/data` 数据浏览(仅 admin)、`/login`、`/r/:token` 老板周报。

```
api/        后端：boot(入口+静态托管) / 各 *Router(tRPC) / lib / queries（DB）
contracts/  前后端共享类型与常量（含 CRM 阶段流、AI 指令 zod 白名单）
db/         schema.ts = 数据库唯一真源；migrations/*.sql 被 gitignore
src/        前端：pages / components(dash 看板卡、crm、ui shadcn) / hooks / providers
```

要改数据模型 → 先读 `db/schema.ts`；要加/改接口 → 先看对应 `api/*Router.ts` 与 `api/router.ts` 汇总；CRM 阶段/标签只在 `contracts/crm.ts` 一处改。

## 2) 硬性规则（违反 = 闯祸）

1. **密钥不进仓库**。部署变量（APP_SECRET / DATABASE_URL / 管理员账号 / 腾讯云 SECRET_ID|KEY / LLM_KEY / SYNC_TOKEN）只存在于仓库外 `../cloudbase-setup/redeploy.mjs` 与运行时环境变量；向其他 Agent 只报变量名，不复述值。
2. **MySQL 5.7 兼容（TDSQL）**：`DEFAULT (now())` 必改为 `DEFAULT CURRENT_TIMESTAMP`；`drizzle-kit push` 不可靠，改 schema 走 generate → 手工修 SQL → apply（脚本外置）。
3. **权限模型**：CRM 写操作只过 `adminWrite`（`role='admin'`）。“点编辑没反应”先查 `users.role`，别改前端瞎猜。单租户、无数据隔离，**本地开发连的也是线上库，测试操作会改真实数据**。
4. **样式纪律**：`--n-accent` 是语义红（危险/逾期/错误），勿当品牌色改；动画只用 `transform/opacity/filter`；两套主题（html[data-theme]）改动要同时照顾。公共 class/变量定义看 `src/index.css` 注释。
5. **读取纪律**：未明确要求前**禁止全库递归读取**——先定向检索（grep / 单文件 / 目录列表），确有全局需要再扩大。使用 agent teams/多代理前先判断：分拆是否真的比一个 Agent 更快更好，别为用而用。
6. **完成门槛**：改任何 TS 先 `npm run check`；改前端再 `npm run build`；改动前先确认不会引入孤儿 import/参数（tsc 严格）。

## 3) 同意 vs 已授权

**已授权，直接做（符合上文规则时）**
- 本地迭代：改代码 → `npm run check` → `npm run build` → git 本地提交 → push（仓库约定：部署后自动推送，GitHub 与线上保持一致）
- 在 admin「数据」页/现有业务页做白名单内的数据小改（走业务接口）
- 读任何文件、跑 `npm run dev`、本地 curl/接口自测

**先征得用户同意，别擅自**
- 云端部署 / 数据库迁移 / 环境变量或密钥改动（含 sync/LLM 配置）
- 删除数据、结构性改 schema、新建表或大模块
- 涉及产品方向/领域模型（5 类关系、阶段流、同步策略）——先记入 PRD 决策（D 系列）再动代码

## 4) 按需查哪（不在此展开）

| 想搞清楚 | 打开 |
|---|---|
| 表字段 / 枚举 | `db/schema.ts`（表名即业务名） |
| CRM 阶段流/标签/归档 | `contracts/crm.ts` |
| 商机概率/业务规则 | `api/crmRouter.ts`、README「功能一览」 |
| AI 指令能做什么/白名单 | `contracts/commands.ts`（zod 即权威） |
| 某页面用哪些接口 | 页面/卡片组件顶部 import 与 `useQuery` |
| 认证/会话 | `api/password-auth.ts`、`api/lib/cookies.ts` |
| 部署/迁移操作步骤 | `../部署指南-CloudBase.md`、`../cloudbase-setup/` 脚本注释 |
| 产品定位与版本史 | `README.md` |

## 5) 快捷命令

```bash
npm run dev      # 本地 http://localhost:3000（前端即时刷新）
npm run check    # 类型检查（改完必跑）
npm run build    # 生产构建
npm run db:generate
```

_不确定现状就先按上表定向读源码再改，别猜；文档与代码冲突时以代码为准并回改文档。_
