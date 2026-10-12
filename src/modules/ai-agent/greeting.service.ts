import { Inject, Injectable } from '@nestjs/common';
import { MoodType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { shanghaiDate } from '../../common/crypto.util';
import { moodLabel } from '../../common/mood';
import { withTimeout } from '../../common/with-timeout';
import {
  MODEL_CLIENT,
  type ChatTurn,
  type ModelClient,
} from '../model/model.client';

/** 问候语最多等 6 秒，超时就用模板。 */
export const GREETING_TIMEOUT_MS = 6000;

export interface Greeting {
  text: string;
  moodType: MoodType;
  moodLabel: string;
  weather: 'rain' | 'sunny';
  checkedIn: boolean;
}

/** 精灵主动开场。今天打过卡就聊今天，没打卡就用最近一次情绪。 */
export function greetingLine(input: {
  moodType: MoodType;
  checkedIn: boolean;
}): string {
  if (!input.checkedIn) {
    return '岛上今天很安静，先坐一会儿，想说什么都可以。';
  }
  const LINES: Record<MoodType, string> = {
    ecstatic: '今天的太阳很好，你的高兴我也替你收着了。',
    calm: '今天很稳，岛上的风也轻。',
    tired: '今天累了，先歇一会儿，我在。',
    anxious: '今天的雨还没停，不用急着想明白。',
    sad: '今天下雨了，难过不用急着好起来。',
  };
  return LINES[input.moodType];
}

export function greetingMessages(input: {
  moodType: MoodType;
  checkedIn: boolean;
  content?: string;
}): ChatTurn[] {
  return [
    {
      role: 'system',
      content:
        '你是心屿的伴生精灵。用户刚打开岛屿，说一句问候，一到两句，三十字以内。不说教，最多问一个问题。只输出这句话。',
    },
    {
      role: 'user',
      content: input.checkedIn
        ? `我今天已经打卡，情绪是${moodLabel(input.moodType)}。日记：${input.content ?? ''}`
        : '我今天还没有打卡。',
    },
  ];
}

export function weatherFor(moodType: MoodType): 'rain' | 'sunny' {
  return moodType === MoodType.anxious || moodType === MoodType.sad
    ? 'rain'
    : 'sunny';
}

@Injectable()
export class GreetingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MODEL_CLIENT) private readonly model: ModelClient,
  ) {}

  async greeting(userId: string, now = new Date()): Promise<Greeting> {
    const record = await this.prisma.checkInRecord.findUnique({
      where: {
        userId_checkInDate: { userId, checkInDate: shanghaiDate(now) },
      },
    });
    const checkedIn = Boolean(record);
    // 没打卡时沿用最近一次情绪的天气，岛屿不会突然放晴。
    const latest = checkedIn
      ? record
      : await this.prisma.checkInRecord.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
    const moodType = latest?.moodType ?? MoodType.calm;
    const weather = weatherFor(moodType);

    return {
      text: await this.writeGreeting({
        moodType,
        checkedIn,
        content: record?.content,
      }),
      moodType,
      moodLabel: moodLabel(moodType),
      weather,
      checkedIn,
    };
  }

  private async writeGreeting(input: {
    moodType: MoodType;
    checkedIn: boolean;
    content?: string;
  }): Promise<string> {
    const fallback = greetingLine(input);
    if (!process.env.AI_API_KEY?.trim()) return fallback;

    try {
      const model = process.env.AI_SMALL_MODEL || 'small-model';
      const text = await withTimeout(
        this.model.complete(model, greetingMessages(input)),
        GREETING_TIMEOUT_MS,
        'greeting timeout',
      );
      return text.trim() || fallback;
    } catch {
      return fallback;
    }
  }
}
