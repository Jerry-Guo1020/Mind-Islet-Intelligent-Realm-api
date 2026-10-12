import { MoodType } from '@prisma/client';
import {
  AiEncouragement,
  ENCOURAGEMENT_MAX_LENGTH,
  ENCOURAGEMENT_TIMEOUT_MS,
  encouragementMessages,
  encouragementWriterFactory,
} from './ai-encouragement';
import { TemplateEncouragement } from './encouragement';
import { ModelClient } from '../model/model.client';

const TEMPLATE = new TemplateEncouragement();

function modelStub(complete: ModelClient['complete']): ModelClient {
  return { complete, stream: jest.fn() };
}

describe('encouragementMessages', () => {
  it('tells the model the mood in Chinese and includes the diary', () => {
    const messages = encouragementMessages({
      moodType: MoodType.anxious,
      content: '明天要汇报',
    });

    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain('焦虑');
    expect(messages[1].content).toContain('明天要汇报');
    expect(messages[0].content).toContain('只输出回应本身');
  });
});

describe('AiEncouragement', () => {
  const originalEnv = {
    AI_API_KEY: process.env.AI_API_KEY,
    AI_LARGE_MODEL: process.env.AI_LARGE_MODEL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses the model wording when the model answers', async () => {
    const complete = jest.fn().mockResolvedValue('  我在这儿，慢慢说。  ');
    const service = new AiEncouragement(modelStub(complete));

    await expect(
      service.write({ moodType: MoodType.anxious, content: '明天要汇报' }),
    ).resolves.toBe('我在这儿，慢慢说。');
  });

  it('asks the configured model for the reply', async () => {
    process.env.AI_LARGE_MODEL = 'my-large-model';
    const complete = jest.fn().mockResolvedValue('好');
    const service = new AiEncouragement(modelStub(complete));

    await service.write({ moodType: MoodType.calm, content: '还行' });

    expect(complete).toHaveBeenCalledWith('my-large-model', expect.any(Array));
  });

  it('falls back to the template when the model fails', async () => {
    const complete = jest.fn().mockRejectedValue(new Error('model down'));
    const service = new AiEncouragement(modelStub(complete));

    await expect(
      service.write({ moodType: MoodType.sad, content: '没考好' }),
    ).resolves.toBe(await TEMPLATE.write({ moodType: MoodType.sad }));
  });

  it('falls back to the template when the model answers with blanks', async () => {
    const complete = jest.fn().mockResolvedValue('   ');
    const service = new AiEncouragement(modelStub(complete));

    await expect(
      service.write({ moodType: MoodType.tired, content: '加班' }),
    ).resolves.toBe(await TEMPLATE.write({ moodType: MoodType.tired }));
  });

  it('falls back to the template when the model takes longer than the budget', async () => {
    jest.useFakeTimers();
    try {
      const complete = jest.fn(() => new Promise<string>(() => undefined));
      const service = new AiEncouragement(modelStub(complete));

      const pending = service.write({
        moodType: MoodType.ecstatic,
        content: '收到好消息',
      });
      await jest.advanceTimersByTimeAsync(ENCOURAGEMENT_TIMEOUT_MS + 1);

      await expect(pending).resolves.toBe(
        await TEMPLATE.write({ moodType: MoodType.ecstatic }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('cuts an over-long model answer down to the limit', async () => {
    const long = '好'.repeat(ENCOURAGEMENT_MAX_LENGTH + 20);
    const service = new AiEncouragement(
      modelStub(jest.fn().mockResolvedValue(long)),
    );

    const reply = await service.write({
      moodType: MoodType.calm,
      content: '还行',
    });

    expect(reply).toHaveLength(ENCOURAGEMENT_MAX_LENGTH);
  });
});

describe('encouragementWriterFactory', () => {
  const originalKey = process.env.AI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
  });

  it('prefers the model writer once a key is configured', () => {
    process.env.AI_API_KEY = 'sk-test';
    const ai = { write: jest.fn() };
    const template = { write: jest.fn() };

    expect(encouragementWriterFactory(ai, template)).toBe(ai);
  });

  it('keeps the template writer without a key', () => {
    delete process.env.AI_API_KEY;
    const ai = { write: jest.fn() };
    const template = { write: jest.fn() };

    expect(encouragementWriterFactory(ai, template)).toBe(template);
  });

  it('treats a blank key as missing', () => {
    process.env.AI_API_KEY = '   ';
    const ai = { write: jest.fn() };
    const template = { write: jest.fn() };

    expect(encouragementWriterFactory(ai, template)).toBe(template);
  });
});

describe('TemplateEncouragement', () => {
  it('says something different for anxious and sad', async () => {
    const anxious = await TEMPLATE.write({ moodType: MoodType.anxious });
    const sad = await TEMPLATE.write({ moodType: MoodType.sad });

    expect(anxious).not.toBe(sad);
  });
});
