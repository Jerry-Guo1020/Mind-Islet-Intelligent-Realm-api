import { MoodType } from '@prisma/client';
import { moodLabel } from '../../common/mood';

/**
 * 「今天打卡了什么」这一段上下文，聊天回复和主动问候共用**同一份措辞**。
 *
 * 两处各写一遍必然走散：2026-10-24 之前就是问候那边写中文情绪名
 * （`情绪是焦虑`）、聊天那边直接把枚举塞进 prompt（`打卡情绪是anxious`）。
 * 模型读到 `anxious` 和一个中文词混着来，语气和判断都会飘。所以句子只在这里拼，
 * 两个调用方只负责把数据凑齐。
 */

/** 关键词最多给模型几个。`extractKeywords` 本来就 ≤5，这里是防历史数据里更多。 */
export const CONTEXT_MAX_KEYWORDS = 5;

/** 一个关键词都没抽出来时的占位。整段省掉会让模型以为「今天什么都没发生」。 */
export const NO_KEYWORD_TEXT = '（没抽出关键词）';

/** 今天还没打卡时给模型的那句。沿用聊天里原本的说法。 */
export const NO_CHECKIN_LINE = '今天还没有打卡，按平静、晴天陪伴。';

/** 天气也是中文。模型不需要知道我们内部管雨天叫 `rain`。 */
const WEATHER_LABELS: Record<'rain' | 'sunny', string> = {
  rain: '雨',
  sunny: '晴',
};

export interface TodayCheckIn {
  moodType: MoodType;
  content: string;
  keywords: string[];
  /** 打卡那一刻精灵说过的话。主动问候不给这一项（不然问候和打卡那句重复）。 */
  aiReply?: string | null;
  /** 岛屿天气。主动问候不给这一项。 */
  weather?: 'rain' | 'sunny';
}

/** 打卡记录上挂着的图谱节点就是关键词，取的时候顺手去空、去重、封顶。 */
export function checkInKeywords(
  record: { nodes?: { keyword: string }[] } | null | undefined,
): string[] {
  const words: string[] = [];
  for (const node of record?.nodes ?? []) {
    const keyword = typeof node.keyword === 'string' ? node.keyword.trim() : '';
    if (!keyword || words.includes(keyword)) continue;
    words.push(keyword);
    if (words.length === CONTEXT_MAX_KEYWORDS) break;
  }
  return words;
}

export function keywordText(keywords: string[]): string {
  return keywords.length > 0 ? keywords.join('、') : NO_KEYWORD_TEXT;
}

/** 拼成给模型看的一行。可选段不给就不出现。 */
export function todayCheckInLine(input: TodayCheckIn): string {
  const head = input.weather
    ? `今天的打卡：情绪「${moodLabel(input.moodType)}」，岛屿天气${WEATHER_LABELS[input.weather]}`
    : `今天的打卡：情绪「${moodLabel(input.moodType)}」`;
  const lines = [
    `${head}。`,
    `日记：${endSentence(input.content)}`,
    // 「别照着念」必须留着：不写的话模型会把五个词念一遍当回复。
    `从日记里抽出的关键词：${keywordText(input.keywords)}（只是线索，别照着念）。`,
  ];
  if (input.aiReply) {
    lines.push(`精灵在打卡时说过：${endSentence(input.aiReply)}`);
  }
  return lines.join('');
}

/** 日记和鼓励语是用户/模型写的，末尾可能自带句号 —— 别再补一个，变成「。。」。 */
function endSentence(text: string): string {
  const trimmed = text.trim();
  return /[。！？!?…]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}
