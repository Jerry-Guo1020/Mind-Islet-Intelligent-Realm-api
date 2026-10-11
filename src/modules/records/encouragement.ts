import { MoodType } from '@prisma/client';

export interface EncouragementWriter {
  write(input: { moodType: MoodType; content: string }): Promise<string>;
}

const LINES: Record<MoodType, string> = {
  ecstatic: '今天的岛上出了太阳，你的高兴我收到了。',
  calm: '岛上很安静，你今天把自己安放得很好。',
  tired: '累了就先靠岸，明天的路可以慢慢走。',
  anxious: '今天岛上下雨了，你似乎有些难过，我陪你听听雨声吧。',
  sad: '今天岛上下雨了，你似乎有些难过，我陪你听听雨声吧。',
};

export class TemplateEncouragement implements EncouragementWriter {
  write(input: { moodType: MoodType }): Promise<string> {
    return Promise.resolve(LINES[input.moodType]);
  }
}
