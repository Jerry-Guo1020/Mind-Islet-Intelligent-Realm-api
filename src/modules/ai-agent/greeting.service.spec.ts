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

function prismaStub(
  record: { id?: string; moodType: MoodType; content?: string } | null,
) {
  return {
    checkInRecord: {
      findUnique: jest.fn().mockResolvedValue(record),
      findFirst: jest.fn().mockResolvedValue(record),
    },
    aiGreeting: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
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
      keywords: ['汇报', '紧张'],
    });

    expect(messages[1].content).toContain('焦虑');
    expect(messages[1].content).toContain('明天要汇报');
    // 日记里抽出的特征：精灵开场就该看得见，而不是只看得见情绪
    expect(messages[1].content).toContain('汇报、紧张');
    // 枚举字面量不许漏给模型
    expect(messages[1].content).not.toContain('anxious');
  });

  it('says the day is empty when the user has not checked in', () => {
    const messages = greetingMessages({
      moodType: MoodType.calm,
      checkedIn: false,
    });

    expect(messages[1].content).toContain('还没有打卡');
    // 没打卡就没有今天的日记，也就不该提关键词
    expect(messages[1].content).not.toContain('关键词');
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
    const prisma = prismaStub(null);
    prisma.checkInRecord.findFirst.mockResolvedValue({
      moodType: MoodType.sad,
      content: '没考好',
    });
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
      // 开场白要说得出「今天写了什么」，关键词得跟着记录一起读出来
      include: { nodes: { select: { keyword: true } } },
    });
    expect(prisma.checkInRecord.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('falls back to calm and sunny when the user has no history', async () => {
    const prisma = prismaStub(null);
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
    const prisma = prismaStub({
      moodType: MoodType.anxious,
      content: '明天要汇报',
    });
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
    expect(prisma.aiGreeting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({ day: '2026-10-12', text: '早上好，雨还没停。' }),
      }),
    );
  });

  it('reuses the greeting stored for today and does not call the model', async () => {
    process.env.AI_API_KEY = 'sk-test';
    const prisma = prismaStub({ id: 'record-1', moodType: MoodType.calm });
    prisma.aiGreeting.findUnique.mockResolvedValue({
      day: '2026-10-12',
      text: '今天已经打过招呼了',
      moodType: MoodType.calm,
      weather: 'sunny',
      checkedIn: true,
    });
    const complete = jest.fn();
    const service = new GreetingService(prisma as never, modelStub(complete));

    await expect(service.greeting('user-1', NOW)).resolves.toMatchObject({
      text: '今天已经打过招呼了',
      checkedIn: true,
    });
    expect(complete).not.toHaveBeenCalled();
    expect(prisma.aiGreeting.upsert).not.toHaveBeenCalled();
  });

  it('writes a new greeting once the calendar day has changed', async () => {
    const prisma = prismaStub(null);
    prisma.aiGreeting.findUnique.mockResolvedValue({
      day: '2026-10-11',
      text: '昨天的问候',
      moodType: MoodType.sad,
      weather: 'rain',
      checkedIn: false,
    });
    const service = new GreetingService(prisma as never, modelStub(jest.fn()));

    await expect(service.greeting('user-1', NOW)).resolves.toMatchObject({
      text: greetingLine({ moodType: MoodType.calm, checkedIn: false }),
    });
    expect(prisma.aiGreeting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ day: '2026-10-12' }),
      }),
    );
  });

  it('keeps the template when the model fails', async () => {
    process.env.AI_API_KEY = 'sk-test';
    const prisma = prismaStub({
      moodType: MoodType.ecstatic,
      content: '收到好消息',
    });
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
      const prisma = prismaStub(null);
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
