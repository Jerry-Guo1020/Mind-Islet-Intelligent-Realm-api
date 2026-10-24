import { MoodType } from '@prisma/client';
import { CompanionService, FALLBACK_REPLY } from './companion.service';
import { NO_CHECKIN_LINE } from './checkin-context';
import { ModelClient } from '../model/model.client';

function prismaStub() {
  const messages: { role: string; content: string }[] = [];
  return {
    messages,
    client: {
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(
          ({ data }: { data: { role: string; content: string }[] }) => {
            messages.push(...data);
          },
        ),
      },
      checkInRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    },
  };
}

describe('CompanionService', () => {
  it('sends only the fallback when the first hop fails and does not call the second', async () => {
    const db = prismaStub();
    const stream = jest.fn();
    const model: ModelClient = {
      complete: jest.fn().mockRejectedValue(new Error('timeout')),
      stream,
    };
    const service = new CompanionService(db.client as never, model);
    const events: unknown[] = [];

    await service.respond(
      { userId: 'user-1', message: '我好难过' },
      (event) => {
        events.push(event);
      },
    );

    expect(stream).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: 'delta', text: FALLBACK_REPLY },
      { type: 'finish' },
    ]);
    expect(db.messages).toEqual([
      { userId: 'user-1', role: 'user', content: '我好难过' },
      { userId: 'user-1', role: 'assistant', content: FALLBACK_REPLY },
    ]);
  });

  it('builds the second prompt from the strategy and saves the full reply', async () => {
    const db = prismaStub();
    db.client.checkInRecord.findUnique.mockResolvedValue({
      moodType: MoodType.sad,
      content: '考试没考好',
      aiReply: '我陪你听听雨声',
      nodes: [{ keyword: '考试' }, { keyword: '熬夜' }],
    });
    const model: ModelClient = {
      complete: jest
        .fn()
        .mockResolvedValue(
          '{"core_emotion":"难过","time_relevance":"high","strategy":"empathy"}',
        ),
      stream: jest.fn((_model, messages, onDelta) => {
        onDelta('我在');
        onDelta('。');
        expect(messages[0].content).toContain('先接住情绪');
        expect(messages[0].content).toContain('考试没考好');
        // 情绪和天气都走中文：模型从前读到的是 sad / rain
        expect(messages[0].content).toContain('「悲伤」');
        expect(messages[0].content).toContain('雨');
        expect(messages[0].content).not.toContain('sad');
        expect(messages[0].content).not.toContain('rain');
        // 日记里抽出的特征也要给到它
        expect(messages[0].content).toContain('考试、熬夜');
        return Promise.resolve('我在。');
      }),
    };
    const service = new CompanionService(db.client as never, model);
    const events: unknown[] = [];
    await service.respond(
      { userId: 'user-1', message: '还是难受' },
      (event) => {
        events.push(event);
      },
    );

    expect(events).toEqual([
      { type: 'delta', text: '我在' },
      { type: 'delta', text: '。' },
      { type: 'finish' },
    ]);
    expect(db.messages[1]).toEqual({
      userId: 'user-1',
      role: 'assistant',
      content: '我在。',
    });
    // 今日打卡连着挂在上面的关键词一起读，不然模型的「特征」是空的
    expect(db.client.checkInRecord.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { nodes: { select: { keyword: true } } },
      }),
    );
  });

  it('says the day is empty without a check-in, and never asks for keywords', async () => {
    const db = prismaStub();
    const model: ModelClient = {
      complete: jest.fn().mockResolvedValue('{"strategy":"empathy"}'),
      stream: jest.fn((_model, messages, onDelta) => {
        expect(messages[0].content).toContain(NO_CHECKIN_LINE);
        expect(messages[0].content).not.toContain('关键词');
        onDelta('我在。');
        return Promise.resolve('我在。');
      }),
    };
    const service = new CompanionService(db.client as never, model);

    await service.respond({ userId: 'user-1', message: '在吗' }, () => {});

    expect(model.stream).toHaveBeenCalled();
  });

  it('pushes the reasoning stream before the reply and keeps it out of the history', async () => {
    const db = prismaStub();
    const model: ModelClient = {
      complete: jest.fn().mockResolvedValue('{"strategy":"empathy"}'),
      stream: jest.fn((_model, _messages, onDelta, onReasoning) => {
        onReasoning?.('先接住');
        onReasoning?.('情绪。');
        onDelta('我在。');
        return Promise.resolve('我在。');
      }),
    };
    const service = new CompanionService(db.client as never, model);
    const events: unknown[] = [];
    await service.respond({ userId: 'user-1', message: '我好累' }, (event) =>
      events.push(event),
    );

    expect(events).toEqual([
      { type: 'thinking', text: '先接住' },
      { type: 'thinking', text: '情绪。' },
      { type: 'delta', text: '我在。' },
      { type: 'finish' },
    ]);
    expect(db.messages).toEqual([
      { userId: 'user-1', role: 'user', content: '我好累' },
      { userId: 'user-1', role: 'assistant', content: '我在。' },
    ]);
  });

  it('rejects an unknown strategy before the second hop', async () => {
    const db = prismaStub();
    const stream = jest.fn();
    const model: ModelClient = {
      complete: jest.fn().mockResolvedValue('{"strategy":"diagnose"}'),
      stream,
    };
    const service = new CompanionService(db.client as never, model);
    const events: unknown[] = [];
    await service.respond({ userId: 'user-1', message: '你好' }, (event) =>
      events.push(event),
    );
    expect(stream).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: 'finish' });
    expect(db.messages[1].content).toBe(FALLBACK_REPLY);
  });
});
