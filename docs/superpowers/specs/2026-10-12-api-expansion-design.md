# 心屿智境后端补全设计

日期：2026-10-12
状态：待用户审核
基线：嵌套副本，提交 `8a8d12f`（与 GitHub main 和线上一致）
依据：《心屿智境-产品与页面架构说明》V1.0（`../../Mind-Islet-analysis/`），与 `2026-10-10-api-scope-design.md`

## 背景

页面说明把产品定为 13 个页面。对照当前后端，登录、岛屿天气与资产、打卡、信箱、精灵聊天、退出这条主链路已经能对上。对不上的是个人管理中心整块（P10–P12）、精灵引导状态（P08）、精灵主动开场与历史记录（P09），以及打卡奖励的中文名、成长阶段这类展示字段。

本设计补齐这些缺口，并顺手修掉几处实现问题。不改变主链路已经确定的形态：opaque session 而非 JWT、一次打卡同时产出资产与信件、信箱就是打卡记录、精灵 WebSocket 双跳。

## 决定

1. 补 `me` 模块承担 P10、P11、P12、P08。`users` 模块当前是空的，由它填实。
2. `User` 表加 `spirit_onboarded`、`reminder_enabled`、`reminder_time` 三列，一次 migration。
3. 资产中文名、情绪中文名、成长阶段都由枚举推导，不落库。
4. 鼓励语改为按 `AI_API_KEY` 选择模型生成，失败回落到模板。
5. 不加新依赖。参数校验用手写函数，与现有 `parseMood` 风格一致。
6. 抽出 `ModelModule`，让 `records` 不必依赖 `ai-agent`。

## 接口

### 新增

| 接口 | 页面 | 说明 |
| --- | --- | --- |
| `GET /api/me` | P10 | 返回资料与概览，见下方字段 |
| `PATCH /api/me` | P11 | 更新昵称、头像，返回与 `GET /api/me` 同形 |
| `GET /api/me/settings` | P12 | 返回 `reminderEnabled`、`reminderTime` |
| `PATCH /api/me/settings` | P12 | 写入同上两项 |
| `POST /api/me/spirit/onboard` | P08 | 标记引导完成，幂等，返回 `{ spiritOnboarded: true }` |
| `GET /api/ai/greeting` | P09 | 精灵主动开场白，结合今天的打卡与天气 |
| `GET /api/ai/messages` | P09 | 历史聊天记录，`limit`、`before` 分页 |

`GET /api/me` 与 `PATCH /api/me` 的返回：

```
id, nickname, avatar, createdAt,
daysOnIsland,     入岛天数
totalCheckIns,    累计打卡数
streak,           连续打卡天数
checkedInToday,   今天是否已打卡
growthStage,      barren | sprout | oasis
spiritOnboarded
```

`GET /api/ai/greeting` 返回：

```
text, moodType, moodLabel, weather, checkedIn
```

`GET /api/ai/messages` 返回 `{ messages: [{ id, role, content, createdAt }] }`，`limit` 默认 20 上限 50，`before` 为 ISO 时间，按时间倒序取再正序返回。

### 改动

| 接口 | 改动 |
| --- | --- |
| `POST /api/auth/guest-login`、`POST /api/auth/wechat-login` | `userInfo` 增加 `spiritOnboarded` |
| `POST /api/records` | 返回值增加 `moodLabel`、`assetName`、`assetTypeLabel`、`assetRelation`、`growthStage`、`totalCheckIns`、`streak`；`asset` 内增加 `assetName`、`assetTypeLabel` |
| `GET /api/island/assets` | 每件资产增加 `assetName`、`assetTypeLabel`、`moodLabel` |
| `GET /api/island/weather` | 增加 `moodLabel` |
| `GET /api/mailbox/letters/:recordId` | 增加 `moodLabel` |

P02 的数据由 `GET /api/island/weather`、`GET /api/island/assets`、`GET /api/me` 三个接口分担，不做聚合接口。当前没有已实现的小程序客户端，因此允许改动既有响应字段；只增字段，不改字段名，不删字段。

## 数据模型

```
model User {
  spiritOnboarded Boolean @default(false) @map("spirit_onboarded")
  reminderEnabled Boolean @default(false) @map("reminder_enabled")
  reminderTime    String? @map("reminder_time") @db.Char(5)
}
```

三列都有默认值或可空，现有行不受影响。migration 用 `prisma migrate diff` 由旧 schema 到新 schema 离线生成，写入 `prisma/migrations/<时间戳>_add_user_settings/migration.sql`，由部署脚本里的 `prisma migrate deploy` 应用。

## 计算口径

| 项 | 口径 |
| --- | --- |
| 入岛天数 | 上海时区自然日差加 1，注册当天为 1 |
| 连续打卡天数 | 今天有打卡则从今天往前数；今天没打卡则从昨天往前数；都没打卡为 0 |
| 成长阶段 | 累计 0 次为 `barren` 荒岛；1 至 6 次为 `sprout` 萌芽；7 次及以上为 `oasis` 绿洲 |
| 提醒时间 | `HH:mm`，24 小时制，按上海时区解释。打开提醒但没给时间时按 `20:00` 存 |

`PATCH /api/me` 至少要带一个可改字段，否则返回 400。`PATCH /api/me/settings` 同理。

## 结构

- 抽出 `src/modules/model/`，承载 `MODEL_CLIENT`、`OpenAiModelClient`。`ai-agent` 与 `records` 都 import 它。`records` 生成鼓励语要调模型，若让它依赖 `ai-agent`，边界就错了。
- 新增无 IO 的纯函数模块：`src/common/mood.ts`、`src/common/assetMeta.ts`、`src/modules/progress/progress.ts`、`src/common/validation.ts`。
- `EncouragementWriter` 接缝已存在，新增 `AiEncouragement` 实现，在 `RecordsModule` 里按 `AI_API_KEY` 是否为空选择模型实现或模板实现。模型失败、超时（8 秒）或返回空串时回落到模板。同时修掉模板里焦虑与悲伤共用一句的问题。
- 新增 `progress` 模块，`ProgressService.snapshot` 提供入岛天数、累计打卡、连续天数、成长阶段。`me` 与 `records` 都复用它，统计只实现一处。
- `me` 模块含 `MeController`、`MeService`，`MeService` 复用 `progress.ts`、`assetMeta.ts` 的纯函数。
- 新增 `src/app.module.spec.ts`，编译整个 `AppModule`。这个测试能拦住 10-12 那次 `AuthEnv` 被 Nest 当成依赖、运行时变成 `Object` 的启动崩溃。

## 健壮性

- `AuthService.authenticate` 现在每个请求都写一次 `lastUsedAt`，改为距上次写入超过 5 分钟才写。
- WebSocket 入参校验：非法 JSON、空消息、超过 500 字的消息都回 `{ type: 'error' }`，不调模型。
- `mailbox` 的 `year`、`month` 加严格校验：四位年份、1 至 12 月。
- `main.ts` 启用 shutdown hooks，让 WebSocket 与 Prisma 正常关闭。
- 昵称校验：去空白后 1 至 12 字，不允许换行与控制字符。头像校验：`https://` 开头，长度不超过 512。

## 明确不做

- 不接入微信订阅消息，`reminder_*` 只存偏好。沿用范围设计的"不做推送"。
- 不做 P12 隐私说明与"关于"的接口。它们是静态文案，且数据保留策略尚未确定。
- 不做手动摆放资产、删除打卡、删除聊天记录、管理后台、好友。
- 不改关键词抽取算法，不引入分词或 NLP 依赖。
- 不改小程序。

## 分阶段

1. 基础设施：`ModelModule`、`mood.ts`、`assetMeta.ts`、`growth.ts`、`validation.ts`、`app.module.spec.ts`、`lastUsedAt` 节流。
2. 数据与个人中心：migration、`me` 模块、登录响应补 `spiritOnboarded`。
3. 打卡与岛屿：资产中文名字段、`records` 返回值补全、`AiEncouragement`。
4. 精灵：`greeting`、`messages`、WebSocket 加固。

每阶段以 `tsc --noEmit`、`eslint`、`jest` 验证。单测沿用现有做法，不连数据库。