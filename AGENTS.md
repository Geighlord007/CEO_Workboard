# AGENTS.md · WTC 每周任务控制台（CEO_Workboard）

> 给 AI 编码助手 / 任何 Agent 的**项目设计说明书** —— 动手前先读这一页。
> GitHub 私有仓库 `Geighlord007/CEO_Workboard`，本目录（`app-cloudbase/`）即仓库工作副本。
> 源码是唯一事实来源：本文逐节与 `db/schema.ts`、`contracts/*`、`api/*Router.ts` 对齐；若发现不一致，以代码为准并回改本文。

---

## 目录
0. [铁律](#0-铁律违反会出事故)
1. [产品是什么 / 使用者是谁](#1-产品是什么)
2. [全局设计约定](#2-全局设计约定)
3. [数据模型：表结构全集（20 张表）](#3-数据模型表结构全集)
4. [看板域业务逻辑](#4-看板域业务逻辑)
5. [CRM 域业务逻辑](#5-crm-域业务逻辑)
6. [AI 指令助手链路](#6-ai-指令助手链路)
7. [API 总览（tRPC 路由树）](#7-api-总览)
8. [认证与会话](#8-认证与会话)
9. [前端架构与视觉约定](#9-前端架构与视觉约定)
10. [命令 / 部署 / 迁移 / 高频坑](#10-命令部署迁移高频坑)
11. [已知规划与未实现](#11-已知规划与未实现)

---

## 0) 铁律（违反会出事故）

1. **绝不把密钥写进任何会被 git 跟踪的文件**（代码 / README / 本文 / commit message）。
   部署所需变量（`APP_SECRET`、`DATABASE_URL`、管理员邮箱与初始密码、腾讯云 `SECRET_ID/SECRET_KEY`、`ENV_ID`）只存在于：仓库外的 `../cloudbase-setup/redeploy.mjs`（含硬编码值，勿复制进仓库）与运行时 pwsh 环境变量。跟新 Agent 交代部署时引用**变量名**即可，**不要复述具体值**。
2. **数据库是 MySQL 5.7 兼容（腾讯云开发 TDSQL）**：8.0 语法 `DEFAULT (now())` 会直接报错，一律用 `DEFAULT CURRENT_TIMESTAMP`；`drizzle-kit push` 在此库不可靠，改 schema 走「generate → 手工修 SQL → apply」流程（§10.5）。
3. **验证通过才算完成**：改任何 TS 先 `npm run check`（tsc -b）；改前端再 `npm run build`；涉及线上的改动按 §10.3 部署并**在线上真实 URL** 验证后 `git push`。
4. **CRM 写操作只有 `role="admin"` 能过**（`adminWrite` 中间件）。历史遗留 `role="user"` 账号会造成「看板点编辑没反应」这类静默失败——先查 `users.role`，别瞎改前端。密码账号 bootstrap 创建时已置 `role: "admin"`。
5. **单租户产品，无多用户隔离**：数据全局共享，权限只区分「写（admin）/ 读（user）」。
6. **未明确要求前，禁止全库递归读取**：先做定向检索（grep / 按路径读单文件）与目录列表，别把整个 `src`、`api`、`db` 一次性读完；确实需要全局理解时再扩大范围。

---

## 1) 产品是什么

面向个人 / 极小团队（合成生物初创「总助 + CEO」双角色）的**看板 + CRM 一体化工作台**。用户自己就是「总助」账号（admin，可写）；CEO 用只读账号或只读周报链接。

两个主界面：

| 界面 | 路由 | 定位 |
|---|---|---|
| 看板 Dashboard | `/` | 执行层：本周任务 / 日历 / 日程 / 节点倒计时 / 风险 / 客户·供应商推进 / 习惯可视化 / 便签 / 快捷入口 / AI 指令助手 |
| CRM | `/crm` | 关系层：客户 / 顾问 / 合作方 / 供应商 / 投资人 5 类关系，终态自动归档；下有商机 / 跟进 / 样品 / 报表 / 供应商 / AI 快捷栏等 Tab |
| 登录 | `/login` | 邮箱 + 密码（Google 可选） |
| 老板周报 | `/r/:token` | 公开只读聚合页，凭分享令牌 |

核心设计命题：**看板卡片与 CRM 是同一份数据**（dashboard 上的客户推进卡直接推进 CRM 里的关系，不是只读副本）；**关系层与单据层分离**（商机 / 询价 / 样品各自走流程，只有关系本身进终态才归档）。

---

## 2) 全局设计约定

- **单租户**：无租户列、无数据级隔离（§0.5）。
- **日期一律存 `YYYY-MM-DD` 字符串**（`varchar(10)`），只在展示层换算，避免服务器/客户端时区打架。唯一例外是记录型时间戳列（`createdAt/updatedAt/completedAt/happenedAt/lastActivityAt`）用 `timestamp`（服务器时间）。
- **时刻存「距当天 0 点分钟数」**（`startMin/endMin/offworkMin`，int，0–1439），可空 = 全天 / 未记录。
- **金额**：`decimal`（MySQL 驱动返回字符串）；写接口输入 `number`，路由里 `String(x)` 落库，读出来按需 `Number()`。
- **多态挂接**：`subjectType + subjectId` 双列把任意业务行挂到 CRM 主体（`account|opportunity|supplier|sample|rfq`…），无 DB 级外键。
- **软状态 vs 硬删除**：关系/单据用阶段表达生命周期（终态=归档，不删行）；便签/任务/风险等小表用硬删除。
- **删除不设 DB 级外键约束**：需要级联的地方由代码显式处理（例：删 account 先删其 contacts）；其余靠调用侧纪律。
- **重复信息只存一处**：例如「带截止日任务自动进日历」不是写两遍，而是日历/日程卡片在前端合并 `events` 与 `tasks(dueDate)`。

---

## 3) 数据模型：表结构全集

schema 唯一权威：`db/schema.ts`（Drizzle mysql-core）。Drizzle 关系在 `db/relations.ts`（少量，供 `db.query.*` 使用，见 `riskRouter` 的 deals 查询）。迁移历史 `db/migrations/*.sql`（已被 gitignore，线上靠 §10.5 手工 apply）。

### 3.0 表目录

| 表 | 域 | 一句话用途 |
|---|---|---|
| `users` | 认证 | 登录账号（Google / 邮箱两种来源合一） |
| `tasks` | 看板 | 按周组织的任务清单 |
| `events` | 看板 | 日历事项（会议/里程碑/截止日/出差/事项） |
| `milestones` | 看板 | 关键节点倒计时 |
| `notes` | 看板 | 便签 |
| `risks` | 看板 | 风险与阻塞（红灯项） |
| `deals` | 看板(遗留) | 旧版极简 BD pipeline（初谈/方案/报价/签约）；新 UI 已由 CRM relationship 取代，接口仍保留 |
| `links` | 看板 | 快捷入口 |
| `activity` | 看板 | 每日习惯数据：打卡强度(可手动覆盖) + 收工时间 |
| `settings` | 系统 | 键值表（分享令牌等；`key` 是 MySQL 保留字所以列名 `k`） |
| `accounts` | CRM | 机构/客户表，统一承载 client/consultant/partner 三类关系 |
| `contacts` | CRM | 客户联系人（决策链画像） |
| `opportunities` | CRM | 商机（项目主线程） |
| `activities` | CRM | 沟通/动作时间线 |
| `samples` | CRM | 寄样/测试闭环 |
| `suppliers` | CRM | 供应商（采购侧，独立于客户） |
| `investors` | CRM | 投资人/VC（融资侧，独立） |
| `rfqs` | CRM | 询价比价 |
| `quality_events` | CRM | 供应商交期/质量/服务事件 |
| `docs` | CRM | 统一文档外链（带版本） |

### 3.1 users（认证账号）

| 列 | 类型 | 说明 |
|---|---|---|
| id | serial PK | |
| unionId | varchar(255) unique notNull | Google=sub；邮箱登录=`p:<email>` |
| name | varchar(255) | 显示名（邮箱首段） |
| email | varchar(320) | 邮箱（Google 或白名单邮箱） |
| avatar | text | 头像（未用） |
| passwordHash | varchar(255) | scrypt 哈希 `salt:hash`（hex），邮箱登录用 |
| role | enum `user`/`admin` | 默认 user；bootstrap 管理员为 admin |
| createdAt / updatedAt / lastSignInAt | timestamp | |

### 3.2 tasks（周任务）★ 看板核心

| 列 | 说明 |
|---|---|
| id | PK |
| title | varchar(500) |
| track | enum `bd`(BD拓展) / `research`(战略·市场调研) / `supplier`(供应商协调) / `ceo`(CEO支持) |
| priority | tinyint 0=P0紧急 1=P1正常 2=P2可缓（默认 1） |
| done | bool，默认 false |
| completedAt | timestamp，完成时刻（记录用） |
| completedDay | varchar(10)，完成时前端本地日期（**热力图/趋势线按它聚合**） |
| dueDate | varchar(10)，可空；**有值 → 出现在日历/今日日程**（前端合并） |
| link | varchar(1000) 关联文档 |
| weekOf | varchar(10)，**所属周的周一日期**（任务按周组织的挂载点） |
| sortOrder | int，组内手排 |
| subjectType / subjectId | 预留 CRM 多态挂接（当前 UI 建任务不填） |
| createdAt | timestamp |

列表排序约定：`done asc → priority asc → sortOrder asc → id asc`（未完成在前、P0 在前）。「周」的语义：`weekOf` = 周一日期，三周范围 = `[上周一, 本周一, 下周一]`（见 §6 上下文）。

### 3.3 events（日历事项）

| 列 | 说明 |
|---|---|
| id / date(varchar10) / title(varchar255) | |
| kind | enum `meeting`/`milestone`/`deadline`/`trip`/`other`，默认 meeting |
| startMin / endMin | int，距 0 点分钟数；null=全天 |
| location | varchar(255) |
| subjectType / subjectId | CRM 多态挂接（拜访/评审归属商机或客户） |
| createdAt | timestamp |

### 3.4 milestones（关键节点倒计时）

`title`、`targetDate`（目标日，排序字段）、`startDate`（进度点阵起算日）、`createdAt`。倒计时与进度百分比 = f(今天, startDate, targetDate)，前端实时算。

### 3.5 notes（便签）

`content`(text)、`sortOrder`、`createdAt`。排序 `sortOrder asc, id asc`。

### 3.6 risks（风险阻塞）

`title`、`detail`(text 卡在哪)、`needFrom`(需要谁支持)、`level` enum `high|mid|low`（默认 mid）、`resolved` bool、`subjectType/subjectId`（CRM 挂接）、`createdAt`。列表排序：`resolved asc → level asc → id desc`（未解决在前、高风险在前）。

### 3.7 deals（遗留 BD pipeline）

`name`、`stage` enum `contact(初谈)/proposal(方案)/quote(报价)/won(签约)`、`note`、`sortOrder`、时间戳。路由：list/create/move(前移后移一格)/remove，仍挂在 `dealRouter`（api/riskRouter.ts）。**新产品逻辑请用 relationship/opportunities，别扩展此表。**

### 3.8 links（快捷入口）

`label`、`url`、`sortOrder`、`createdAt`。

### 3.9 activity（每日习惯，day 唯一）

| 列 | 说明 |
|---|---|
| day | varchar(10) **unique**（upsert 主键） |
| level | tinyint 0–3 手动覆盖强度；**为空时前端按当天完成数自动映射** |
| offworkMin | int 收工时间（距 0 点分钟数），收工散点图数据源 |
| 时间戳 | |

### 3.10 settings（键值）

`k` varchar(100) PK、`v` text。现仅存 `shareToken`（老板周报令牌）。**该列叫 k 不是 key**（MySQL 保留字）。

### 3.11 accounts（客户/顾问/合作方机构）

| 列 | 说明 |
|---|---|
| id / name(255) | |
| relationshipType | enum `client`/`consultant`/`partner`，默认 client（供应商、投资人走独立表，见 §5.1） |
| kind | enum `company/institute/lab/government/other`（公司/院所/实验室/政府） |
| industry | varchar(64) 行业 |
| stage | 一个**共享枚举**（13 值，三类关系阶段并在一列，语义由 `STAGE_FLOW` 界定），默认 prospect |
| website / location / source | 官网 / 地区 / 来源 |
| externalSource / externalId | **同步预留**（airtable/sheets/excel…） |
| nextActionAt / lastContactAt | varchar(10)，活动记录副作用自动刷新（§5.5） |
| aiSummary | text（预留 AI 摘要） |
| tags | varchar(500) 逗号分隔 |
| createdAt / updatedAt | updatedAt 参与关系列表排序 |

`stage` 共享枚举值（三类关系语义前缀注释）：
- client：`prospect 潜在 / following 跟进中 / customer 已成交` 🟢；`inactive 停用 / lost 输单` 🔴
- consultant：`identified 候选 / contacting 接触洽谈 / engaged 合作中` 🟢；`ended 聘期结束 / dropped 未谈成` 🔴
- partner：`candidate 候选评估 / negotiating 洽谈方案 / active 合作中` 🟢；`failed 洽谈未成` 🔴（共用 `ended`）

### 3.12 contacts（联系人）

`accountId`（逻辑外键 → accounts，删 account 时代码先删 contacts）、`name`、`title`、`dept`、
`roleInDeal` enum：`scientist/procurement/qa/finance/exec/decisionMaker/techContact`（科学家/采购/质量/财务/高管/决策人/技术联系人）、
`stance`：`supporter/neutral/blocker/unknown`（立场）、`influence`：`H/M/L`（影响力）、
`email/wechat/phone`、`memo`、`lastContactAt`。

### 3.13 opportunities（商机 = 项目主线程）

| 列 | 说明 |
|---|---|
| id / accountId(必填) / title | |
| stage | enum：`identify 识别 → tech_discussion 技术交流 → proposal_quote 方案与报价 → sample_poc 样品/POC → contract 商务与合同 → delivery 交付执行` 🟢；`won 验收回款` / `lost 输单(必填原因)` 🔴 |
| amountCny | decimal(14,2) 项目金额（人民币，报价口径） |
| probability | tinyint 0–100；**留空 = 按阶段默认概率**（见 §5.3 映射表） |
| expectedClose | varchar(10) 预计成交日 |
| source | 来源 |
| ownerId | int 默认 1（预留） |
| 6 个验证物开关 | `techDiscussionDone / proposalSent / sampleSent / pocPassed / ndaSigned / contractSigned`（技术交流/方案发出/样品发出/POC通过/NDA签署/合同签署），作为推进门槛的真值 |
| nextAction / nextActionDue | 下次动作与时限（activity 记录时自动刷新 nextActionDue） |
| lastActivityAt | timestamp，活动副作用刷新；**summary 里 14 天无动作 = stale** |
| lostReason / wonAt | 输单必填原因；won 自动写今日日期 |
| tags / memo | |
| createdAt / updatedAt | |

### 3.14 activities（CRM 沟通时间线）

`subjectType`(`account|opportunity|supplier`)、`subjectId`、`kind`(`call/wechat/email/meeting/visit/sample/other`)、`summary`(2000，沟通要点)、`contacts`、`nextActionAt`、`happenedAt`(默认 now)、`createdAt`。写时间线会同步刷新关联主体（§5.5）。

### 3.15 samples（寄样/测试闭环）

`opportunityId?` / `accountId?`（至少给一个）、`title`、`qtySpec`、`sentAt`、`tracking`、`status` enum `requested→sent→testing→passed/failed/retest`、`feedback`(text)、`followUpAt`、`createdAt`。

### 3.16 suppliers（供应商）

`name`、`stage` enum `asked 询价中 / comparing 比价中 / approved 已准入` 🟢；`dropped 本轮弃用 / retired 淘汰停用` 🔴（默认 asked）、
`category`（`gene_synthesis/primer/sequencing/reagent/consumable/equipment/cdmo/logistics/other` 等自由串）、
`contactName/contactPhone/contactWechat`、`accountTerms`(账期)、`singleSource` bool(单一来源)、`risk` char `H/M/L`、`memo`、`externalSource/externalId`、时间戳。

### 3.17 investors（投资人/VC）

`name`、`firm`(机构/基金名)、`stage` enum `contacted→deck→pitched→dd→ts→closing` 🟢；`funded/declined/withdrawn` 🔴（默认 contacted）、`contactName`、`tags`(VC/产业资本/政府基金/天使/银行)、`memo`、`externalSource/externalId`、时间戳。

### 3.18 rfqs（询价比价）

`supplierId`(必填)、`item`、`qty`、`priceCny` decimal(12,2)、`deliveryDays` int、`validUntil`、`status` enum `asking/comparing/chosen/dropped`、`memo`、`createdAt`。

### 3.19 quality_events（供应商质量事件）

`supplierId`、`kind`(`delay/quality/service`)、`summary`、`impact`、`resolvedAt`(varchar10)、`memo`、`createdAt`。

### 3.20 docs（统一文档外链）

`subjectType`(`account|opportunity|sample|supplier|rfq`)、`subjectId`、`kind`(`proposal/quote/nda/contract/coa/report/caseStudy/qualification/other`)、`title`、`url`、`version` int 默认 1（同文档多次上传=新版本行）、`createdAt`。

### 3.21 关系总览（ASCII）

```
users(认证)
tasks / events / milestones / notes / risks / deals(遗留) / links / activity / settings

accounts(机构) ──< contacts(联系人)
   │  1..n
   └── opportunities(商机) ──< activities(时间线) / samples / docs
                                  (subjectType 多态也允许 account/supplier)
suppliers ──< rfqs / quality_events
investors
（所有外键均为逻辑外键；activities/samples/docs 均可多态挂到不同主体）
```

---

## 4) 看板域业务逻辑

### 4.1 周任务
- **一周 = 周一日期**（`weekOf`）。`mondayOf()` 把任意日期规约到所在周的周一（跨月也正确）。
- 列表排序（§3.2）由 `task.listWeek` 给定，前端按 track（业务线）分组展示。
- **完成打卡**：`task.toggle {done, day}`——勾选时写 `done=true + completedAt=now + completedDay=前端本地今天`；取消勾选三者清空。**热力图/趋势线只认 `completedDay`**（跨时区安全）。
- **编辑**：`task.update` 支持改 title/track/priority/dueDate/link（整体覆盖式 patch）。
- **删除/新建**：`task.remove` 硬删；`task.create` 需要明确的 `weekOf`。
- **结转**（AI 场景 `task.carry`）：把未完成任务改写 `weekOf` 到目标周（同一行移动，不复制）。
- **日历联动**：`task.listDated` 返回所有 `dueDate` 非空任务；`CalendarCard`/`ScheduleCard` 在前端把 events + datedTasks 合并展示（月历红点/今日日程），DB 不冗余。

### 4.2 日历 / 今日日程
- `event.list` 全量（日期升序 → startMin → id）。CalendarCard 渲染月历；ScheduleCard 筛出「今天」的 events + 当天 due 的任务。
- 时间字段 `startMin/endMin` 可空（全天）。删除用 `event.remove`；改事项暂未开放（只增删）。

### 4.3 关键节点
- `milestone.list/create/update/remove`。进度 = (今天 − startDate) / (targetDate − startDate)，前端钳制 0–1。

### 4.4 风险阻塞
- `risk.list/create/setResolved/remove`；「红灯」排序与 resolved 语义见 §3.6。老板周报只聚合**未解决**风险。

### 4.5 习惯可视化（热力图/趋势/收工）
- 数据源 = `task.counts{days}`（按 completedDay 聚合完成任务数）+ `activity.range{from,to}`（打卡覆盖与收工）。
- 热力图格子 0–3 级：有 `activity.level` 手填值用之；否则前端按当日完成任务数自动映射（具体阈值/映射规则见 HeatmapCard 实现，别在文档里猜）。
- `activity.setLevel` 点击今天格子手填；`activity.setOffwork` 记收工（upsert by day）。

### 4.6 快捷入口 / 便签
- `link.list/create/remove`、`note.list/create/remove`；无编辑，靠删除重建。

### 4.7 老板周报（公开只读）
- 令牌存 `settings.k='shareToken'`。`report.getToken` 登录后取（不存在则生成）；`report.rotateToken` 轮换（旧链接立即 404）。
- `report.byToken{token}`（public，无鉴权）：校验令牌 → 返回 `{本周任务, 下周任务, 未解决风险, 里程碑}`，全部实时聚合自业务表，**没有单独的周报表**。路由 `/r/:token` 前端只读渲染。

---

## 5) CRM 域业务逻辑

### 5.1 关系模型（v0.3，权威在 `contracts/crm.ts`）
- 5 类关系 `client/consultant/partner/supplier/investor`；底层 **3 张表**：`accounts`（前 3 类）、`suppliers`、`investors`（**客户与供应商分开**）。
- 每类关系一条阶段流：`STAGE_FLOW[type] = { stages🟢[], terminal🔴[] }`；标签在 `STAGE_LABELS`。工具函数 `isArchivedStage()`、`stageIndex()`（终态 = stages.length，即结果位）前后端共用。

| 类型 | 🟢 进行中（按序） | 🔴 终态（自动归档） |
|---|---|---|
| client 客户 | prospect 潜在 → following 跟进中 → customer 已成交 | inactive 停用 / lost 输单 |
| consultant 顾问 | identified 候选 → contacting 接触洽谈 → engaged 合作中 | ended 聘期结束 / dropped 未谈成 |
| partner 合作方 | candidate 候选评估 → negotiating 洽谈方案 → active 合作中 | ended 合作结束 / failed 洽谈未成 |
| supplier 供应商 | asked 询价中 → comparing 比价中 → approved 已准入 | dropped 本轮弃用 / retired 淘汰停用 |
| investor 投资人 | contacted 初步接触 → deck 材料已发 → pitched 路演 → dd 尽调 → ts 条款谈判 → closing 交割中 | funded 投资完成 / declined 婉拒 / withdrawn 放弃 |

- **归档 = 阶段值本身**：无独立 isArchived 列。`relationship.setStage` 把关系置成任一终态阶段即归档；置回 🟢 阶段即恢复。「进行中 / 历史」只是前端按 `isArchivedStage` 过滤切换（RelationshipsPage）。
- 看板「客户推进 / 供应商推进」卡（PipelineCard，`relType` client|supplier）与 CRM「关系」页共用 `crm.relationship.list/create/setStage`——**同一份数据**。改了阶段卡片和 CRM 同时变。
- 默认阶段：`relationship.create` 时 account 一律 `prospect`、supplier `asked`、investor `contacted`（注意：account 分支对 consultant/partner 也落 `prospect`，是现状，非各自流的首阶段——想改需要按 type 分发）。

### 5.2 单据层（挂在关系之下，各自走流程）
- **商机 opportunities** 挂在 account 下（项目/定制服务制，无 SKU）。推进 = 改 stage + 维护 6 个验证物开关。**约束**：`crm.opportunity.update` 进 `lost` 必填 `lostReason`（否则抛 BAD_REQUEST）；进 `won` 自动写 `wonAt=今天`。另注意 `ai.execute` 的 `opp.stage` 在进 `won` 时会**清空 lostReason**（而 crm 路由不主动清，两处行为略有差异）。AI 建商机只能从 open 阶段开始（不允许直接 won/lost）。
- **跟进活动 activities**：记一条沟通 = 插 `activities` 行 + 副作用（见 §5.5），是「防冷掉」的抓手。
- **样品 samples**：`requested→sent→testing→passed/failed/retest`，关联 opportunity 或 account；feedback 回填、followUpAt 定时催。
- **供应商侧**：rfq（询价 asking/comparing/chosen/dropped）+ quality_events（delay/quality/service，可标 resolvedAt）。
- **文档 docs**：五类主体通用挂接，version 自增语义（同题多版本=多行）。

### 5.3 漏斗 / 预测逻辑（`opportunity.summary`，只读）
- 默认成交概率映射 `STAGE_PROB`（服务端硬编码，与阶段绑定）：`identify 10% → tech_discussion 20% → proposal_quote 40% → sample_poc 60% → contract 80% → delivery 90% → won 100% → lost 0`。
- `probability` 手填则覆盖默认。
- 汇总输出：`byStage{count,amount}`、`totalAmount`（总金额）、`weighted`（∑金额×概率 = 加权预测）、`staleCount`（非终态 & 距 now > 14 天无 `lastActivityAt`）、`nextDueCount`（7 天内 `nextActionDue` 到期）。

### 5.4 权限（P0 模型，D9 决定）
| 操作 | 中间件 | 说明 |
|---|---|---|
| CRM 所有读 / relationship.list / opportunity.summary | `authedQuery` | 登录即可（CEO 只读） |
| CRM 所有写（account/contact/opp/activity/sample/supplier/rfq/qualityEvent/doc/relationship.create/setStage） | `adminWrite`（=adminQuery） | 仅 `role='admin'`（总助） |

看板域（task/event/milestone/note/risk/link/activity）目前全部 `authedQuery`（登录可写）。

### 5.5 关键副作用（务必复用 helper，别在各路由手抄）
`api/crm-helpers.ts` 的 `insertCrmActivity(tx, input)`（在 `crm.activity.create` 与 `ai.execute activity.log` 共用）：
1. 插入 `activities` 行；
2. subject 为 opportunity → 刷新该商机 `lastActivityAt = now`、`nextActionDue = nextActionAt`；
3. subject 为 account → 刷新 `lastContactAt = nextActionAt ?? 今天`、`nextActionAt`。
**新增任何「记沟通」入口都必须走它**，否则 stale/next-due 判断会失真。

### 5.6 删除纪律
- `crm.account.remove` 先删该 account 的 contacts 再删 account（代码级级联）。
- 删 opportunity/supplier 等**不级联**删其 activities/samples/rfqs/docs——历史记录应保留，宁可孤儿行也别静默清历史；删除功能慎用。

---

## 6) AI 指令助手链路

一句话改看板/CRM。完整约束在 `contracts/commands.ts`（zod 白名单，前后端共用），链路 = **意图(intents) → 步骤(steps) → 事务执行**：

```
用户话术
  → ai.plan：组装"最小上下文" → 调 LLM（OpenAI 兼容，env LLM_*）→ JSON 意图
  → planFromIntents（纯函数，对照真实数据展开成 带 label+before 的步骤）
  → 前端预览（破坏性操作红字）
  → ai.execute：单个 MySQL 事务顺序执行；任一步失败整体回滚
```

### 6.1 最小上下文（aiRouter 组装，LLM 只能看到这些）
- `today`（今天+星期）、`weeks`（上周/本周/下周三个 weekOf，**只允许引用这三个**）；
- tasks（上/本/下周三周）、risks 全量、notes 全量（content 截 120）、accounts(id,name ≤300)、opportunities(id,title,accountId,stage ≤500)、suppliers(id,name ≤200)、activity 今天行。
- **规则强调给 LLM**：id 只能取自上下文；「全部/所有」展开成逐个 intent；相对时间换算成 YYYY-MM-DD；不清楚就返回 `{ask}` 而不是猜；新建任务 weekOf 只能三选一；业务线关键词映射（BD/调研/供应商/CEO）→track。

### 6.2 意图 → 步骤（plan.ts，纯函数可单测）
- zod `intentsSchema`（24 种 kind，见 §7 表）→ 服务器逐一校验存在性/周范围/去重（`once()`）→ 生成人类可读 `label`（预览文案）+ `before`（撤销/校验用的原值）。
- 不合规输入**绝不猜测执行**：目标 id 不在上下文 → ask「刷新后重试」；周不在范围/已完成结转/商机直接 won 等 → 汇总 `problems` 一次 ask。
- 每批最多 60 步。

### 6.3 事务执行（execute.ts）
- 所有步骤在 `db.transaction` 内按序跑；`update/delete` 影响行数为 0（`ensureAffected`）视为目标已被并发改动 → 抛 `StepError{at}` → **整批回滚**（以事务代替逐条撤销）。
- 结果 `{ok:true, executed:n}` 或 `{ok:false, at, message}`。前端拿到失败就刷新并提示。
- 破坏性 kind（`task.remove/risk.remove/note.remove`）在 `DESTRUCTIVE_KINDS` 标注，预览必须红字。

---

## 7) API 总览

HTTP 端点：认证两个 POST（`/api/auth/password/login`、`/api/auth/google`）+ 一个 GET config + `/api/trpc/*`（POST，全部业务）；静态文件由同一 Hono 服务托管。tRPC 路由树（`api/router.ts` 汇总）：

```
ping(public)
auth            .me / .logout
task            .listWeek{weekOf} / .listDated / .create / .update / .toggle{done,day} / .remove / .counts{days}
event           .list / .create / .remove
milestone       .list / .create / .update / .remove
note            .list / .create / .remove
link            .list / .create / .remove
risk            .list / .create / .setResolved / .remove
deal(遗留)       .list / .create / .move{dir:-1|1} / .remove
activity        .range{from,to} / .setLevel{day,level0-3} / .setOffwork{day,minutes}
ai              .plan{text} / .execute{steps[]}          （LLM 未配置 → ok:false code:not_configured）
report          .getToken / .rotateToken / .byToken{token}(public)
crm
  account        .list/.create/.update{patch}/.remove
  contact        .listByAccount/.create/.update/.remove
  opportunity    .list{stage?}/.create/.update{patch}/.remove/.summary
  activity       .list{subjectType,subjectId}/.create
  sample         .list{opportunityId?,accountId?}/.create/.update/.remove
  supplier       .list/.create/.update/.remove
  rfq            .list{supplierId?}/.create/.update/.remove
  qualityEvent   .list{supplierId?}/.create/.update/.remove
  doc            .list{subjectType,subjectId}/.create/.remove
  relationship   .list/.create{type,name}/.setStage{type,id,stage}   ← 看板/CRM 共用的统一关系入口
```

读=authedQuery；CRM 写=adminWrite（§5.4）。输入全走 zod：日期 `DAY_RE`、分钟 0–1439、金额 number（落库 String）。

---

## 8) 认证与会话

- **两套登录**，统一落到 `users`：
  - 邮箱+密码（主推）：`POST /api/auth/password/login` → `loginWithPassword()`。
    白名单 `ALLOWED_EMAILS`（逗号分隔）拦截；密码 scrypt(`crypto.scrypt`，`salt:hash`) 存 `passwordHash`；首登逻辑：该邮箱无 passwordHash 时，仅当 `ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD` 匹配才用初始密码**初始化**该账号（创建时 `unionId='p:'+email`、`role:'admin'`），之后用这组密码正常登录。
  - Google（可选）：config 端点运行时下发 clientId（不烤进前端产物）；callback 换 session。
- **会话**：签发 JWT（`signSessionToken`，密钥 `APP_SECRET`）→ `set-cookie: wtc_sid`（httpOnly、30 天、同域路径 /、secure 按部署）。Cookie 名/时长在 `contracts/constants.ts`（`Session`）。
- **上下文**：每个 tRPC 请求 `createContext` → `authenticateRequest(headers)` 解出 user（失败不抛，留给各 procedure 的 requireAuth 决定）。
- **前端**：`useAuth()` 挂 `auth.me`（staleTime 5min）；`logout` 清 cookie 并跳 `/login`；`redirectOnUnauthenticated` 让 Home/CrmPage 自动回登录页。
- 角色即 `user.role`：`user`=CEO 只读；`admin`=总助可写。CRM 界面上方徽标「总助·可写 / CEO·只读」即读此值。

---

## 9) 前端架构与视觉约定

### 9.1 路由与页面
`src/App.tsx`：`/`=Home(看板)、`/crm`=CrmPage(Tab 容器)、`/login`、`/r/:token`(ReportPage 公开)、`*`=NotFound。全部包在 `TRPCProvider`（@tanstack/react-query + tRPC httpBatchLink，见 `providers/trpc.tsx`）。

### 9.2 看板卡片 → 数据源（改动卡片时对照）
| 卡片(components/dash) | tRPC 依赖 |
|---|---|
| ClockCard 时钟·节点倒计时 | milestone.list/create/update/remove |
| CalendarCard 月历·事项 | event.list + milestone.list + **task.listDated**（合并） |
| ScheduleCard 今日日程 | event.list + **task.listDated**（合并） |
| NotesCard 便签 / LinksCard 快捷入口 | note.* / link.* |
| TasksCard 本周任务 | task.listWeek + toggle/create/update/remove |
| BatteryCard 本周完成率 | task.listWeek（本地算率） |
| TrendCard 近14天趋势 | task.counts{days:14} |
| OffworkCard 收工散点 | activity.range + setOffwork |
| HeatmapCard 12周热力图 | task.counts{84d} + activity.range + setLevel |
| RisksCard 风险阻塞 | risk.list/create/setResolved/remove |
| PipelineCard 客户/供应商推进 | **crm.relationship.list/create/setStage**（按 relType 过滤） |
| AiAssistant 悬浮 AI | ai.plan/execute |

### 9.3 看板网格布局
- 十二列 grid（`.dash-grid`），`useLayout` 把每卡 span 存 localStorage（`wtc-layout-v1`），拖动点阵把手改大小、双击复原；顺序固定 `CARD_ORDER`（dash/layout.ts）。
- 窄视口自动切**堆叠单列**（`useStacked`：宽<1150 或高<730 → `.stacked`，卡全宽、隐藏把手、min-height 240）。做响应式/加新卡时别假设固定多列。

### 9.4 视觉与组件约定（改动样式前先读这里）
- 主题：`html[data-theme=dark|light]` + shadcn `.dark`；`index.html` 内联脚本首屏前恢复，`hooks/useTheme.ts` 管切换（T 键），选择存 localStorage `wtc-theme`。**这是两套视觉基线，别只改一边。**
- 令牌与公共样式集中在 `src/index.css`：变量与 class 请以文件内注释为纲（避免本文与代码漂移）：
  - `--n-*` = 语义层（bg/card/border/text/dim/faint/accent…）；**`--n-accent` 是语义红（危险/逾期/错误/退出）**，不要改成品宣色；
  - `--nx-*` = 品牌渐变层（青/靛/紫/粉四色与 `--nx-grad`/`--nx-text-grad` 等），品牌主视觉（LOG​​O、主行动按钮等）用它；
  - 常用 class：`.font-dot`（点阵字体 DotGothic16）、`.nlabel`（等宽小标签）、`.ncard`（含 `.ncard::before` 顶部高光发丝，勿删）、`.nbtn`（胶囊按钮）、`.nbtn-accent`（主行动渐变按钮）、`.nicon`、`.nx-brand`（渐变字）、`.nx-logo` 等。
- shadcn 组件在 `components/ui/*`（Radix + cva），Tailwind 主题色绑定上面的 CSS 变量；CRM 页正文偏 shadcn 风格，看板偏点阵/卡片风格，靠同一套变量统一观感。
- 动效纪律：动画只改 `transform/opacity/filter`；页面级背景光斑用 fixed 伪元素（`body::before/::after`，`#root` z-index:1 保证内容在上）；已做 `prefers-reduced-motion` 全局兜底。新增动效别引入布局抖动/卡顿。

### 9.5 工具与钩子
`hooks/useNow`(当前时间 tick)、`useStacked`、`useCountUp`、`useLayout`、`useTheme`、`useAuth`、`useMeasure`；日期工具 `lib/dates.ts`（mondayOf/addDays/dayFmt/weekNo…，与后端 helpers 语义一致）。

---

## 10) 命令 / 部署 / 迁移 / 高频坑

### 10.1 本地命令
```bash
npm run dev            # http://localhost:3000（Hono dev-server + Vite）
npm run check          # tsc -b 全量类型检查（改完必跑）
npm run build          # vite → dist/public；esbuild → dist/boot.js
npm run db:generate    # 按 schema 生成迁移（生成后必须修 DEFAULT (now())）
npm run lint / test
npx tsx db/seed.ts     # 看板演示数据；db/seed-crm.ts = CRM 演示数据
```
需要 Node ≥20。本地 DB 连不上时：dev 用 `.env`（DATABASE_URL 等，参考 `.env.example`）。

### 10.2 本地冒烟（不改线上）
`npm run build` 后以**项目目录为 cwd** 运行 `node dist/boot.js`（设 `NODE_ENV=production` + `APP_SECRET` + `DATABASE_URL`，可填假 DB 只看静态资源），再 curl `/`（应回 index.html）与 `/api/trpc/ping`（应回 `{ok:true}`）。

### 10.3 部署（CloudBase 云托管）
源码目录 = 本仓库；干净目录 `app-cloudbase-deploy`（与源码平级，排除 node_modules/dist/.git/.env*）。流程：
1. `robocopy app-cloudbase app-cloudbase-deploy /E /XD node_modules dist .git /XF .env .env.production .env.local *.log`；
2. 在 `../cloudbase-setup` 用 `redeploy.mjs`（manager-node SDK）部署：`$env:SECRET_ID / SECRET_KEY / ENV_ID` 三项给足后 `node redeploy.mjs`（内部 EnvParams 硬编码了 APP_SECRET/DATABASE_URL/管理员账号——**别把该文件弄进仓库**）；
3. 到线上真实 URL（`https://<env>-<…>.sh.run.tcloudbase.com`）验证：根路径 HTTP 200、能登录、关键页面正常；
4. `git add -A && git commit && git push`（约定：部署后自动推送，GitHub 与线上保持一致）。
> CLI（`tcb`）已登录也能看环境，但 `tcb cloudrun deploy` 不传 EnvParams 有丢环境变量风险——与线上服务不一致前别用，默认走 redeploy.mjs。

### 10.4 代码库纪律
- 私有仓库 `Geighlord007/CEO_Workboard`，分支 main，工作副本就是本目录。
- `gitignore` 已排除：`node_modules/ dist/ .env* db/migrations/*.sql dev-login.ts`。
- **仓库外、勿纳入 git**：`../cloudbase-setup/`（部署/迁移脚本+硬编码密钥）、`../crm-prd/`（PRD 工作区；README/AGENTS 只引用其 `18-关系模型-v0.3.md`）。用户已明确「不用」把 crm-prd 加进仓库。

### 10.5 数据库迁移（标准流程）
1. 改 `db/schema.ts`；
2. `npm run db:generate`（离线产出 `db/migrations/NNNN_*.sql` + snapshot）；
3. 手工修 SQL：`DEFAULT (now())` → `DEFAULT CURRENT_TIMESTAMP`（5.7）；确认没有 8.0-only 语法；
4. 执行：`../cloudbase-setup/apply-sql.mjs`（mysql2 读文件、按 `--> statement-breakpoint` 拆分逐条执行），或手动在 DB 客户端执行；
5. apply 之前别让线上服务依赖新列；可用 `test-conn.mjs` 自检连接。
> 迁移 SQL 已被 gitignore：它们属于「线上已应用」状态，改 schema 以 `schema.ts` 为真源。

### 10.6 高频坑位
- 「编辑不生效」→ 先查 `users.role`（§0.4）；其次查请求是否被 adminWrite 403 静默吞掉。
- `DEFAULT (now())` 报错 → 5.7 兼容问题（§0.2 / §10.5）。
- mysql 驱动 `decimal` 返回字符串：比较/相加前 `Number()`；写库用 `String()`。
- 服务器跑在容器里：别把 `node_modules/dist` 打进部署目录；`serveStatic` 的 root 是相对 **cwd** 的（本地冒烟必须 cd 到项目根，见 §10.2）。
- `tsc -b` 严格查未用变量/参数：改完别留孤儿 import/参数（曾有 `compact` 未用参数导致失败先例）。
- 时区：新增“日期”列一律 `varchar(10)` YYYY-MM-DD；只有“时刻/事件”才用 timestamp/分钟数。
- 布局：卡片十二列网格与窄屏堆叠规则见 §9.3，别在窄屏下依赖固定列宽。

---

## 11) 已知规划与未实现

按 PRD（`../crm-prd/00-工作日志与总览.md` D 系列决策）与需求单，仍未落地：
- 关系行「✓签约 / ✕输单 / ○放弃」结果键 + 详情/编辑抽屉（统一关系明细）；
- 外部数据导入（Excel / Airtable / Google Sheets 并行读）；
- **双向同步**：accounts/suppliers/investors 的 `externalSource/externalId` 已埋点，待实现「外部为源、看板改动回写」（含冲突策略）；
- 供应商/客户「不同阶段」的可视化区分打磨（早期曾报 UI 不清晰，角色权限修复后疑似已解决，未复核）；
- 安全收尾：轮换曾泄露的腾讯云 API 密钥、改初始密码（有凭据的一方处理）。

_最后一条：不确定现状时先读代码/README/对应 router 再改，别猜；本文与代码冲突时以代码为准并回改本文。_
