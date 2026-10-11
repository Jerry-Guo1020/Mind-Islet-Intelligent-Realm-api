import { MoodType } from '@prisma/client';
import { CompanionService, FALLBACK_REPLY } from './companion.service';
import { ModelClient } from './model.client';

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
        expect(messages[0].content).toContain('rain');
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
