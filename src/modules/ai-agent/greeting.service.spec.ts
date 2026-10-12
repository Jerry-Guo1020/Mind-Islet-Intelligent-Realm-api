import { MoodType } from '@prisma/client';
import { ModelClient } from '../model/model.client';
import {
  GREETING_TIMEOUT_MS,
  GreetingService,
  greetingLine,
  greetingMessages,
} from './greeting.service';

const NOW = new Date('2026-10-12T10:00:00+08:00');

function modelStub(complete: jest.Mock): ModelClient {
  return { complete, stream: jest.fn() };
}

describe('greetingLine', () => {
  it('invites a check-in when the day is still empty', () => {
    expect(
      greetingLine({ moodType: MoodType.calm, checkedIn: false }),
    ).toContain('很安静');
  });

  it('answers the mood once the day has been written down', () => {
    const tired = greetingLine({ moodType: MoodType.tired, checkedIn: true });
    const calm = greetingLine({ moodType: MoodType.calm, checkedIn: true });

    expect(tired).not.toBe(calm);
    expect(tired).toContain('累了');
  });
});

describe('greetingMessages', () => {
  it('carries today diary when the user has checked in', () => {
    const messages = greetingMessages({
      moodType: MoodType.anxious,
      checkedIn: true,
      content: '明天要汇报',
    });

    expect(messages[1].content).toContain('焦虑');
    expect(messages[1].content).toContain('明天要汇报');
  });

  it('says the day is empty when the user has not checked in', () => {
    const messages = greetingMessages({
      moodType: MoodType.calm,
      checkedIn: false,
    });

    expect(messages[1].content).toContain('还没有打卡');
  });
});

describe('GreetingService.greeting', () => {
  const originalEnv = {
    AI_API_KEY: process.env.AI_API_KEY,
    AI_SMALL_MODEL: process.env.AI_SMALL_MODEL,
  };

  beforeEach(() => {
    delete process.env.AI_API_KEY;
    delete process.env.AI_SMALL_MODEL;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('greets from the latest mood when today is still empty', async () => {
    const prisma = {
      checkInRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest
          .fn()
          .mockResolvedValue({ moodType: MoodType.sad, content: '没考好' }),
      },
    };
    const complete = jest.fn();
    const service = new GreetingService(prisma as never, modelStub(complete));

    await expect(service.greeting('user-1', NOW)).resolves.toEqual({
      text: greetingLine({ moodType: MoodType.sad, checkedIn: false }),
      moodType: MoodType.sad,
      moodLabel: '悲伤',
      weather: 'rain',
      checkedIn: false,
    });
    expect(prisma.checkInRecord.findUnique).toHaveBeenCalledWith({
      where: {
        userId_checkInDate: { userId: 'user-1', checkInDate: '2026-10-12' },
      },
    });
    expect(prisma.checkInRecord.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('falls back to calm and sunny when the user has no history', async () => {
    const prisma = {
      checkInRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new GreetingService(prisma as never, modelStub(jest.fn()));

    await expect(service.greeting('user-1', NOW)).resolves.toMatchObject({
      moodType: MoodType.calm,
      moodLabel: '平静',
      weather: 'sunny',
      checkedIn: false,
    });
  });

  it('lets the model open the day once a key is configured', async () => {
    process.env.AI_API_KEY = 'sk-test';
    process.env.AI_SMALL_MODEL = 'my-small-model';
    const prisma = {
      checkInRecord: {
        findUnique: jest.fn().mockResolvedValue({
          moodType: MoodType.anxious,
          content: '明天要汇报',
        }),
        findFirst: jest.fn(),
      },
    };
    const complete = jest.fn().mockResolvedValue('  早上好，雨还没停。  ');
    const service = new GreetingService(prisma as never, modelStub(complete));

    await expect(service.greeting('user-1', NOW)).resolves.toMatchObject({
      text: '早上好，雨还没停。',
      moodType: MoodType.anxious,
      moodLabel: '焦虑',
      weather: 'rain',
      checkedIn: true,
    });
    expect(complete).toHaveBeenCalledWith('my-small-model', expect.any(Array));
  });

  it('keeps the template when the model fails', async () => {
    process.env.AI_API_KEY = 'sk-test';
    const prisma = {
      checkInRecord: {
        findUnique: jest.fn().mockResolvedValue({
          moodType: MoodType.ecstatic,
          content: '收到好消息',
        }),
        findFirst: jest.fn(),
      },
    };
    const service = new GreetingService(
      prisma as never,
      modelStub(jest.fn().mockRejectedValue(new Error('model down'))),
    );

    await expect(service.greeting('user-1', NOW)).resolves.toMatchObject({
      text: greetingLine({ moodType: MoodType.ecstatic, checkedIn: true }),
      checkedIn: true,
    });
  });

  it('keeps the template when the model runs out of time', async () => {
    process.env.AI_API_KEY = 'sk-test';
    jest.useFakeTimers();
    try {
      const prisma = {
        checkInRecord: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const complete = jest.fn(() => new Promise<string>(() => undefined));
      const service = new GreetingService(prisma as never, modelStub(complete));

      const pending = service.greeting('user-1', NOW);
      await jest.advanceTimersByTimeAsync(GREETING_TIMEOUT_MS + 1);

      await expect(pending).resolves.toMatchObject({
        text: greetingLine({ moodType: MoodType.calm, checkedIn: false }),
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
