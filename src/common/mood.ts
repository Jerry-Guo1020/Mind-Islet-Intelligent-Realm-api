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
