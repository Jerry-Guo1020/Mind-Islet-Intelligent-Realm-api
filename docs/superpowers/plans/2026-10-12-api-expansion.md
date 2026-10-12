# 心屿智境后端补全实施计划

> **For agentic workers:** Required workflow is task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 P08 与 P10 至 P12 所需的后端接口，并修掉现有实现里的几处问题。

**Architecture:** 新增 `me` 模块承担个人中心与精灵引导；新增 `progress` 模块提供打卡统计，供 `me` 与 `records` 共用；把模型客户端从 `ai-agent` 抽到 `model` 模块，让 `records` 生成鼓励语时不依赖 `ai-agent`；`ai-agent` 增加 HTTP 侧的问候与历史接口。

**Tech Stack:** Nest.js 11、Prisma 6.19、MySQL 8.4、Node 22、WebSocket（ws）、Jest。

**前置:** `docs/superpowers/specs/2026-10-12-api-expansion-design.md` 已审核通过。

**验证环境:** 代码改在 NAS 副本（挂载于 `/root/project/healthy-island`）。验证在 `/tmp/verify` 跑：`rsync -a --exclude .git --exclude node_modules /root/project/healthy-island/ /tmp/verify/`，然后 `npx tsc --noEmit`、`npx eslint "src/**/*.ts"`、`npx jest`。NAS 上不留 `node_modules`。

---

## 全局约束

- 不新增 npm 依赖。
- 参数校验用手写函数，风格对齐现有 `parseMood`。
- 单测不连数据库，用假对象替代 `PrismaService`。
- 不改小程序，不读写 `.env`，不把密钥写进仓库或日志。
- 响应外壳保持 `{ code, data, msg }`；只增字段，不改名，不删除。
- 既有测试必须继续通过；改行为的测试同步改。

## 文件

| 文件 | 责任 |
| --- | --- |
| `src/modules/model/` | 模型客户端，`MODEL_CLIENT` 令牌 |
| `src/modules/progress/` | 打卡统计的纯函数与 `ProgressService` |
| `src/common/mood.ts` | 情绪中文名 |
| `src/common/assetMeta.ts` | 资产中文名、类型中文、情绪关联说明、情绪到资产的映射 |
| `src/common/validation.ts` | 参数校验 |
| `src/modules/me/` | P10、P11、P12、P08 |
| `src/modules/ai-agent/greeting.service.ts` | P09 主动开场 |
| `src/modules/ai-agent/chat-history.service.ts` | P09 历史记录 |
| `src/modules/ai-agent/ai.controller.ts` | `/api/ai/greeting`、`/api/ai/messages` |
| `src/modules/records/ai-encouragement.ts` | 模型生成鼓励语 |
| `prisma/schema.prisma` + 新 migration | `User` 三个新列 |
| `src/app.module.spec.ts` | 整个 `AppModule` 可编译 |

---

## 阶段 1：基础设施

### 任务 1.1：抽出 `model` 模块

**Files:** Create `src/modules/model/model.module.ts`；Move `model.client.ts`、`openai-model.client.ts` 到 `src/modules/model/`；Modify `src/modules/ai-agent/ai-agent.module.ts`、`src/modules/ai-agent/prompts.ts`、`src/modules/ai-agent/companion.service.ts`、`src/modules/ai-agent/companion.service.spec.ts`

**Interfaces:**
- Produces: `ModelModule`（exports `MODEL_CLIENT`）；`ModelClient`、`ChatTurn` 的路径变为 `src/modules/model/model.client.ts`。

- [ ] `git mv` 两个文件到 `src/modules/model/`，修正模块内相对导入（`../auth/...` 不变，`../../common/...` 不变）。
- [ ] 新建 `model.module.ts`：`providers: [OpenAiModelClient, { provide: MODEL_CLIENT, useExisting: OpenAiModelClient }]`，`exports: [MODEL_CLIENT]`。
- [ ] `ai-agent.module.ts` 改为 `imports: [AuthModule, ModelModule]`，删掉原有两个 provider。
- [ ] 跑 `npx tsc --noEmit` 与 `npx jest`，全绿。
- [ ] 提交。

### 任务 1.2：`progress` 模块

**Files:** Create `src/modules/progress/progress.ts`、`progress.service.ts`、`progress.module.ts`、`progress.spec.ts`

**Interfaces:**
- Produces:
  - `type GrowthStage = 'barren' | 'sprout' | 'oasis'`
  - `growthStage(totalCheckIns: number): GrowthStage`
  - `daysOnIsland(createdAt: Date, now?: Date): number`
  - `currentStreak(checkInDates: string[], today: string): number`
  - `interface ProgressSnapshot { createdAt: Date; daysOnIsland: number; totalCheckIns: number; streak: number; checkedInToday: boolean; growthStage: GrowthStage }`
  - `ProgressService.snapshot(userId: string, now?: Date): Promise<ProgressSnapshot>`

- [ ] 先写失败测试 `progress.spec.ts`：`growthStage(0)` 为 `barren`、`(1)` 为 `sprout`、`(6)` 为 `sprout`、`(7)` 为 `oasis`；`daysOnIsland` 注册当天为 1、跨天加 1；`currentStreak` 今天打卡为连续长度、今天未打卡从昨天数、断档为 0、空数组为 0。
- [ ] 跑测试确认失败。
- [ ] 实现 `progress.ts` 的三个纯函数。日期用 `shanghaiDate` 归一到上海自然日再比较。
- [ ] 跑测试确认通过。
- [ ] 实现 `ProgressService.snapshot`：按 `userId` 取 `createdAt`、`count` 记录数、按 `checkInDate` 倒序取全部日期。
- [ ] 提交。

### 任务 1.3：`mood` 与 `assetMeta`

**Files:** Create `src/common/mood.ts`、`src/common/assetMeta.ts`、`assetMeta.spec.ts`；Modify `src/modules/records/records.service.ts`（删除本地 `ASSET_BY_MOOD`，改为引用）

**Interfaces:**
- Produces:
  - `moodLabel(mood: MoodType): string` → 狂喜、平静、疲惫、焦虑、悲伤
  - `interface AssetMeta { name: string; typeLabel: string; relation: string }`
  - `ASSET_BY_MOOD: Record<MoodType, AssetType>`
  - `ASSET_META: Record<AssetType, AssetMeta>`
  - `metaForMood(mood: MoodType): { assetType: AssetType } & AssetMeta`

- [ ] 先写失败测试：五种情绪都有中文名；每种情绪映射到一种资产；资产名、类型中文、关联说明都非空；焦虑与悲伤对应不同资产且关联说明不同。
- [ ] 跑测试确认失败。
- [ ] 实现两个模块。资产取值：`flower` 向阳花／植物、`grass` 静草／植物、`tree` 雨树／植物、`house` 暖屋／房屋、`house_blue` 蓝色小屋／房屋。
- [ ] 跑测试确认通过。
- [ ] 提交。

### 任务 1.4：`validation`

**Files:** Create `src/common/validation.ts`、`validation.spec.ts`

**Interfaces:**
- Produces:
  - `requireString(value: unknown, field: string, maxLength: number): string`
  - `parseNickname(value: unknown): string`
  - `parseAvatarUrl(value: unknown): string`
  - `parseReminderTime(value: unknown): string`
  - `parseBoolean(value: unknown, field: string): boolean`
  - `parseLimit(value: unknown, fallback: number, max: number): number`
  - `parseIsoDate(value: unknown, field: string): Date`
  - `parseYear(value: unknown): string | undefined`
  - `parseMonth(value: unknown): string | undefined`

- [ ] 先写失败测试：昵称去空白、空串、超 12 字、含换行；头像非 `https://`、超 512 字；时间 `7:5`／`24:00`／`23:60` 拒绝，`00:00`／`23:59` 通过；`parseBoolean` 拒绝字符串 `"yes"`；`parseLimit` 非法回退、超过上限被截断；年份非四位数字拒绝；月份 `0`、`13` 拒绝，`1`、`12` 通过。
- [ ] 跑测试确认失败。
- [ ] 实现，全部抛 `BadRequestException`，消息用中文。
- [ ] 跑测试确认通过。
- [ ] 提交。

### 任务 1.5：`auth` 写入节流与模块编译测试

**Files:** Modify `src/modules/auth/auth.service.ts`、`src/modules/auth/auth.service.spec.ts`；Create `src/app.module.spec.ts`

**Interfaces:**
- Produces: `authenticate` 仅在 `lastUsedAt` 为空或超过 5 分钟时写库。

- [ ] 先写失败测试：`lastUsedAt` 在 1 分钟前时不再调用 `authSession.update`；为 `null` 时调用一次。
- [ ] 跑测试确认失败。
- [ ] 实现节流。`app.module.spec.ts` 编译整个 `AppModule`（`Test.createTestingModule({ imports: [AppModule] }).compile()`）。
- [ ] 跑 `npx jest`，全绿。
- [ ] 提交。

---

## 阶段 2：数据与个人中心

### 任务 2.1：schema 与 migration

**Files:** Modify `prisma/schema.prisma`；Create `prisma/migrations/20261012120000_add_user_settings/migration.sql`

- [ ] `User` 增加 `spiritOnboarded Boolean @default(false) @map("spirit_onboarded")`、`reminderEnabled Boolean @default(false) @map("reminder_enabled")`、`reminderTime String? @map("reminder_time") @db.Char(5)`。
- [ ] 用 `npx prisma migrate diff --from-schema-datamodel <旧 schema 副本> --to-schema-datamodel prisma/schema.prisma --script` 离线生成 SQL，写入新 migration 目录。
- [ ] `npx prisma validate`、`npx prisma generate`。
- [ ] 跑 `npx tsc --noEmit`。
- [ ] 提交。不执行 `migrate dev`，不连数据库。

### 任务 2.2：`me` 模块

**Files:** Create `src/modules/me/me.service.ts`、`me.controller.ts`、`me.module.ts`、`me.service.spec.ts`；Modify `src/app.module.ts`

**Interfaces:**
- Consumes: `ProgressService.snapshot`、`moodLabel`、`parseNickname`、`parseAvatarUrl`、`parseBoolean`、`parseReminderTime`。
- Produces:
  - `MeService.overview(userId, now?): Promise<MeOverview>`
  - `MeService.updateProfile(userId, input: { nickname?: unknown; avatar?: unknown }, now?): Promise<MeOverview>`
  - `MeService.settings(userId): Promise<{ reminderEnabled: boolean; reminderTime: string | null }>`
  - `MeService.updateSettings(userId, input: { reminderEnabled?: unknown; reminderTime?: unknown }): Promise<{ reminderEnabled: boolean; reminderTime: string | null }>`
  - `MeService.markSpiritOnboarded(userId): Promise<{ spiritOnboarded: true }>`
  - `interface MeOverview { id; nickname; avatar; createdAt; spiritOnboarded; daysOnIsland; totalCheckIns; streak; checkedInToday; growthStage }`
  - 路由：`GET /api/me`、`PATCH /api/me`、`GET /api/me/settings`、`PATCH /api/me/settings`、`POST /api/me/spirit/onboard`，全部经 `AuthGuard`。

- [ ] 先写失败测试（假 `PrismaService`）：`overview` 拼出统计字段；`updateProfile` 只带昵称时不改头像；两个字段都不带时抛 400；`updateSettings` 打开提醒但未给时间时存 `20:00`；`markSpiritOnboarded` 幂等。
- [ ] 跑测试确认失败。
- [ ] 实现 service 与 controller。`PATCH` 用 `@Body()`，字段缺失由校验函数判断。
- [ ] 跑测试确认通过。
- [ ] 在 `app.module.ts` 注册 `MeModule`。
- [ ] 提交。

### 任务 2.3：登录响应补 `spiritOnboarded`

**Files:** Modify `src/modules/auth/auth.service.ts`、`src/modules/auth/auth.service.spec.ts`

- [ ] 先写失败测试：新用户 `userInfo.spiritOnboarded` 为 `false`，老用户为该用户的真实值。
- [ ] 跑测试确认失败。
- [ ] `login` 返回值加上该字段。
- [ ] 跑测试确认通过。
- [ ] 提交。

---

## 阶段 3：打卡与岛屿

### 任务 3.1：资产与信件补中文名

**Files:** Modify `src/modules/island/island.service.ts`、`src/modules/mailbox/mailbox.service.ts`、对应 spec

- [ ] 先写失败测试：资产列表每项含 `assetName`、`assetTypeLabel`、`moodLabel`；天气含 `moodLabel`；信件含 `moodLabel`。
- [ ] 跑测试确认失败。
- [ ] 实现。
- [ ] 跑测试确认通过。
- [ ] 提交。

### 任务 3.2：`records` 返回值补全

**Files:** Modify `src/modules/records/records.service.ts`、`records.module.ts`、`records.service.spec.ts`

**Interfaces:**
- Consumes: `ProgressService`、`metaForMood`、`moodLabel`。
- Produces: `POST /api/records` 的 `data` 增加 `moodLabel`、`assetName`、`assetTypeLabel`、`assetRelation`、`growthStage`、`totalCheckIns`、`streak`；`data.asset` 增加 `assetName`、`assetTypeLabel`。

- [ ] 先写失败测试：打卡成功后返回值含上述字段；同日第二次仍返回 409。
- [ ] 跑测试确认失败。
- [ ] 实现：事务提交后调用 `ProgressService.snapshot` 拼统计。
- [ ] 跑测试确认通过。
- [ ] 提交。

### 任务 3.3：`AiEncouragement`

**Files:** Create `src/modules/records/ai-encouragement.ts`、`ai-encouragement.spec.ts`；Modify `src/modules/records/encouragement.ts`、`records.module.ts`、`src/modules/ai-agent/prompts.ts`

**Interfaces:**
- Consumes: `ModelClient`、`MODEL_CLIENT`、`ModelModule`。
- Produces: `AiEncouragement implements EncouragementWriter`；`encouragementMessages(input: { moodType: string; content: string }): ChatTurn[]`。
- 选择规则：`AI_API_KEY` 非空用模型实现，否则用模板实现。

- [ ] 先写失败测试：模型返回文本时采用；模型抛错时回落模板；模型返回空串时回落模板；超过 8 秒未返回时回落模板（用假计时器或可控 promise）。
- [ ] 跑测试确认失败。
- [ ] 实现 `AiEncouragement`，`Promise.race` 加 8 秒上限。
- [ ] 把模板里焦虑与悲伤的文案改成两句不同的。
- [ ] `RecordsModule` 用 `useFactory` 按环境变量选择实现，imports 加 `ModelModule`、`ProgressModule`。
- [ ] 跑测试确认通过。
- [ ] 提交。

---

## 阶段 4：精灵

### 任务 4.1：主动问候

**Files:** Create `src/modules/ai-agent/greeting.service.ts`、`greeting.service.spec.ts`

**Interfaces:**
- Produces: `GreetingService.greeting(userId, now?): Promise<{ text: string; moodType: MoodType; moodLabel: string; weather: string; checkedIn: boolean }>`；`greetingMessages(...)` 加入 `prompts.ts`。

- [ ] 先写失败测试：今天有打卡时用今天的情绪与天气；今天没打卡时取最近一次情绪且天气为平静晴天；模型失败或未配置时返回模板文案且不抛错。
- [ ] 跑测试确认失败。
- [ ] 实现，模型不可用时回落模板。
- [ ] 跑测试确认通过。
- [ ] 提交。

### 任务 4.2：历史记录与 HTTP 路由

**Files:** Create `src/modules/ai-agent/chat-history.service.ts`、`chat-history.service.spec.ts`、`ai.controller.ts`；Modify `src/modules/ai-agent/ai-agent.module.ts`

**Interfaces:**
- Produces: `ChatHistoryService.messages(userId, query: { limit?: unknown; before?: unknown }): Promise<{ messages: { id; role; content; createdAt }[] }>`；路由 `GET /api/ai/greeting`、`GET /api/ai/messages`（经 `AuthGuard`）。

- [ ] 先写失败测试：默认取 20 条、`limit` 超过 50 被截断、非法 `before` 抛 400、按时间倒序取再正序返回。
- [ ] 跑测试确认失败。
- [ ] 实现并注册 controller。
- [ ] 跑测试确认通过。
- [ ] 提交。

### 任务 4.3：WebSocket 加固与关闭钩子

**Files:** Modify `src/modules/ai-agent/ai.gateway.ts`、`src/main.ts`

- [ ] 先写失败测试：非 JSON、空消息、超过 500 字的消息都回 `{ type: 'error' }` 且不调用 `CompanionService`。
- [ ] 跑测试确认失败。
- [ ] 实现校验与长度上限。
- [ ] `main.ts` 增加 `app.enableShutdownHooks()`。
- [ ] 跑测试确认通过。
- [ ] 提交。

---

## 收尾

- [ ] 跑 `npx tsc --noEmit`、`npx eslint "src/**/*.ts"`、`npx jest`，记录真实输出。
- [ ] 确认 `.env.example` 无需新增变量；否则补变量名。
- [ ] 追加 `logs/ai-session.txt`。
- [ ] 提交。不推送，推送会触发线上部署，需用户确认。

## 自检

- 覆盖：spec 的每个接口都有任务（`/api/me` 及其三个子路由在 2.2，问候与历史在 4.1 与 4.2，打卡返回值在 3.2，AI 鼓励语在 3.3，migration 在 2.1，健壮性在 1.5、4.3）。
- 命名一致：统计统一走 `ProgressService.snapshot`，不在 `records` 里重复实现。
- 无占位符：每个任务都有具体文件、接口签名与验证命令。