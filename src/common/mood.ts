import { MoodType } from '@prisma/client';

/** 情绪的中文名。接口传枚举，前端展示这里的中文。 */
export const MOOD_LABELS: Record<MoodType, string> = {
  ecstatic: '狂喜',
  calm: '平静',
  tired: '疲惫',
  anxious: '焦虑',
  sad: '悲伤',
};

export function moodLabel(mood: MoodType): string {
  return MOOD_LABELS[mood];
}

/**
 * 情绪的固定顺序。
 *
 * 成长树按这个顺序把 5 个枝头摆到写死的槽位上，所以「顺序」得有一个唯一的地方定
 * —— 前端 `constants/mood.js` 的 MOOD_TREE_ORDER 和这里必须是同一个顺序。
 * 两边各排一次的话，改的时候必然只改一处，然后树上的枝头就会换位置（而且不报错）。
 * 从 MOOD_LABELS 推出来而不是重写一遍：那张表就是 MoodType 的全集，
 * 加了一种情绪忘了改这里，下面那条测试会当场炸。
 */
export const MOOD_ORDER: MoodType[] = [
  'ecstatic',
  'calm',
  'tired',
  'anxious',
  'sad',
];
