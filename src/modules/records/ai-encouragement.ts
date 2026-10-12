import { Inject, Injectable } from '@nestjs/common';
import { MoodType } from '@prisma/client';
import { moodLabel } from '../../common/mood';
import {
  MODEL_CLIENT,
  type ChatTurn,
  type ModelClient,
} from '../model/model.client';
import {
  TemplateEncouragement,
  type EncouragementWriter,
} from './encouragement';

/** 模型最多等 8 秒。超时就用模板，不让打卡跟着模型一起卡住。 */
export const ENCOURAGEMENT_TIMEOUT_MS = 8000;
/** 落库前的长度上限。 */
export const ENCOURAGEMENT_MAX_LENGTH = 60;

export function encouragementMessages(input: {
  moodType: MoodType;
  content: string;
}): ChatTurn[] {
  return [
    {
      role: 'system',
      content:
        '你是心屿的伴生精灵。回应今天的打卡，一到两句，四十字以内。先接住情绪，不评价、不建议、不追问。只输出回应本身。',
    },
    {
      role: 'user',
      content: `今天的情绪是${moodLabel(input.moodType)}。日记：${input.content}`,
    },
  ];
}

const TEMPLATE = new TemplateEncouragement();

/** 有模型密钥就走模型，没有就用固定文案。 */
export function encouragementWriterFactory(
  ai: EncouragementWriter,
  template: EncouragementWriter,
): EncouragementWriter {
  return process.env.AI_API_KEY?.trim() ? ai : template;
}

@Injectable()
export class AiEncouragement implements EncouragementWriter {
  constructor(@Inject(MODEL_CLIENT) private readonly model: ModelClient) {}

  async write(input: { moodType: MoodType; content: string }): Promise<string> {
    try {
      // 每次现读环境变量，避免在构造函数里把配置固化成对象。
      const model = process.env.AI_LARGE_MODEL || 'large-model';
      const text = await withTimeout(
        this.model.complete(model, encouragementMessages(input)),
        ENCOURAGEMENT_TIMEOUT_MS,
      );
      const trimmed = text.trim();
      if (!trimmed) return TEMPLATE.write({ moodType: input.moodType });
      return trimmed.length > ENCOURAGEMENT_MAX_LENGTH
        ? trimmed.slice(0, ENCOURAGEMENT_MAX_LENGTH)
        : trimmed;
    } catch {
      // 模型不可用不是打卡失败的理由，退回模板文案。
      return TEMPLATE.write({ moodType: input.moodType });
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('encouragement timeout')),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
