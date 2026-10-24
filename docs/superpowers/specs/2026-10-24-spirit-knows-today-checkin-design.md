# 精灵知道今天的打卡（聊天回复 + 主动问候）

日期：2026-10-24
状态：已实现（`src/modules/ai-agent/`，`jest` 174 通过 / `tsc` / prettier）
基线：`f309c9d` + 工作区未提交的「当天问候缓存 / 对话只留 7 天」一批

## 背景

用户要求：每天打卡的内容（记录 + 特征）决定心情状态，**打卡之后跟精灵聊天时，精灵应该知道今天的情况**，能自然引用今天的记录和特征。

现状（都在 `src/modules/ai-agent/`）：

| AI 时刻 | 现在给模型的东西 | 缺什么 |
| --- | --- | --- |
| 聊天回复 `replyMessages` | 打卡情绪（**英文枚举 `anxious`**）、天气、日记正文、打卡鼓励语 | 中文情绪名、关键词 |
| 主动问候 `greetingMessages` | 中文情绪名、日记正文 | 关键词 |
| 打卡时的鼓励语 `encouragementMessages` | 中文情绪名、日记正文 | 本轮不动 |

打卡落库的东西已经够用，缺的只是「送进 prompt」：

- `check_in_records`：`mood_type`、`content`（日记正文，前端 `MAX_CONTENT = 1000`）、`ai_reply`（打卡那一刻的鼓励语）。
- 关键词：`extractKeywords(content)` 抽出 ≤5 个，以 `GraphNode` 通过 `record.nodes` 关联（`records.service.ts`）。

所以这不是「新增数据」，是「把已有的记录 + 特征接到精灵嘴上」。

## 决定

1. **不新增字段、不新增模型调用。** 关键词和情绪都已经在库里，只补 prompt。
2. 新增纯函数模块 `checkin-context.ts`，作为这套措辞的**唯一来源**。聊天和问候都用它 —— 两处各写一遍必然走散（问候那边已经有「中文情绪名」、聊天那边还是英文枚举，就是这么分化出来的）。
3. **聊天回复的情绪从英文枚举改成中文**（`moodLabel()`）。这是现在最实质的毛病：模型读到的是 `anxious` 而不是「焦虑」。
4. **主动问候只带「情绪 + 日记 + 关键词」，不带打卡鼓励语** —— 否则问候和打卡那句会重复说同一件事。
5. 没打卡时保持现状：聊天用 `NO_CHECKIN_LINE`，问候走「我今天还没有打卡。」；问候回落到「最近一次情绪」时，仍然**不把前几天的日记当成今天的**。
6. 关键词**明确标注是线索**（「只是线索，别照着念」），免得模型把五个词念一遍当回复。
7. 本轮不动 `records` 模块：`EncouragementWriter` 接口、打卡鼓励语都不变，所以 `ai-agent` 不需要反向依赖 `records`。

## 上下文长什么样

`todayCheckInLine(input)` 产出**一行**中文，聊天和问候共用（可选段按调用方给不给决定）：

```
今天的打卡：情绪「焦虑」，岛屿天气雨。日记：<content>。从日记里抽出的关键词：加班、失眠（只是线索，别照着念）。精灵在打卡时说过：<aiReply>。
```

措辞取**中性**（不写「今天用户打卡情绪是…」）：问候那边这条是 **user 轮**，在用户角色里用第三人称称呼用户会让模型分不清谁在说话；聊天那边它进 system 提示。中性句子两边都成立。

- `weather`、`aiReply` 是**可选段**：问候不传 `aiReply`（决定 4）。天气也走中文（`rain` → 雨、`sunny` → 晴），现在 prompt 里写的是 `岛屿天气是rain`。
- 关键词为空 → 写「（没抽出关键词）」，而不是整段省略：省略会让模型以为「今天什么都没发生」。
- 关键词最多取 5 个：上限在 `checkInKeywords()`（数据 → 字符串数组）那一步做，两个调用方都因此安全；`keywordText()` 只负责拼接。
- 日记正文整段送（≤1000 字，前端已限长），本轮不加截断。如果以后有超长日记的投诉再补。
- `NO_CHECKIN_LINE = '今天还没有打卡，按平静、晴天陪伴。'`（沿用现在的句子）。注意它和问候里那句「我今天还没有打卡。」是**两个不同的位置**：这句是拼进 system 提示的状态说明，那句是模拟用户开口的输入。不要合并。

## 改动

### 新增 `src/modules/ai-agent/checkin-context.ts`（纯函数，无依赖注入）

```ts
export interface TodayCheckIn {
  moodType: MoodType;
  content: string;
  keywords: string[];
  /** 打卡那一刻精灵说过的话。问候不给这一项。 */
  aiReply?: string | null;
  /** 岛屿天气。问候不给这一项。 */
  weather?: 'rain' | 'sunny';
}

export const NO_CHECKIN_LINE: string;
export function keywordText(keywords: string[]): string; // '加班、失眠' | '（没抽出关键词）'
export function todayCheckInLine(input: TodayCheckIn): string;
export function checkInKeywords(
  record: { nodes?: { keyword: string }[] } | null | undefined,
): string[];
```

放在 `ai-agent` 内：这轮用它的两个服务都在这个模块，不跨模块（决定 7）。

### `companion.service.ts`

- `todayContext()` 的查询加 `include: { nodes: { select: { keyword: true } } }`，返回值带上 `keywords`。
- `weather` 的推导（`anxious`/`sad` → 雨）保持不变。

### `prompts.ts`

- `replyMessages()` 的 `today` 参数类型由内联对象换成 `TodayCheckIn`，句子交给 `todayCheckInLine()`；没打卡时用 `NO_CHECKIN_LINE`。
- `triageMessages()` 不动（它只做策略分类，不需要日记）。

### `greeting.service.ts`

- `greetingMessages()` 入参加 `keywords`，打卡那句改用 `todayCheckInLine()`（不传 `weather` / `aiReply`）。
- `greeting()` 读今日打卡记录时加 `include: { nodes: { select: { keyword: true } } }`，把关键词传给 `writeGreeting()`。
- 未打卡分支（`'我今天还没有打卡。'`）不变。

## 测试

先写红的，再实现（TDD）。

- 新增 `checkin-context.spec.ts`（纯函数）：
  - 中文情绪名和中文天气进句子（`anxious` → 「焦虑」、`rain` → 雨），断言**不出现**枚举字面量；
  - 关键词串成 `加班、失眠`；空数组 → 「（没抽出关键词）」；
  - `aiReply`/`weather` 不给时对应半句**不出现**；
  - 关键词超过 5 个时只取前 5 个。
- `companion.service.spec.ts`：
  - 今日打卡带关键词 → prompt 里有「加班」「失眠」和中文情绪名；
  - **断言 prompt 里不再出现 `anxious` 这类枚举**（防回归，这是本次的核心行为变化）；
  - 没打卡 → prompt 里有 `NO_CHECKIN_LINE`。
- `greeting.service.spec.ts`：
  - 打卡问候带关键词；
  - `checkInRecord.findUnique` 的入参断言加上 `include`（现有断言会挂，属于预期红）。
- `prompts.ts` 之前没有 spec，本轮也不单独加 —— 它的产出由 `companion.service.spec.ts` 从 prompt 内容上验。

## 上线影响

- **会带上工作区未提交的那批**（`ai_greetings` 当天问候缓存、对话只留 7 天、`since` 参数）。因为改动落在 `greeting.service.ts` 同一个文件里，和那批分不开；用户已确认选 B（聊天 + 问候）。
- `deploy/remote-deploy.sh:48` 会在容器里跑 `prisma migrate deploy`，所以 `ai_greetings` 表会自动建。但迁移目录 `prisma/migrations/20261022120000_ai_day_cache/` 目前是**未跟踪文件**：提交时必须 `git add`，否则代码先上线、表没建，`GET /api/ai/greeting` 会 500。
- 前端不改。聊天气泡上那个情绪标签、天气文案都还是从 `greeting` 接口的 `moodType`/`weather` 来，字段没变。

## 已知代价

1. 关键词的顺序来自 `record.nodes` 的关联查询，Prisma 不保证顺序 —— prompt 里关键词的先后可能每次不同。不影响模型理解，但 prompt 不是逐字可缓存的。
2. 同一轮对话的**每一次**回复都会重新注入今日打卡（现状如此），关键词也在每轮重复。这是刻意的：上下文窗口里只有最近 10 条消息，越早注入越容易被挤掉。