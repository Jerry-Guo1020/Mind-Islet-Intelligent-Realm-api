import { BadRequestException } from '@nestjs/common';
import {
  ChatHistoryService,
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
} from './chat-history.service';

const OLDER = new Date('2026-10-12T09:00:00+08:00');
const NEWER = new Date('2026-10-12T09:05:00+08:00');

function prismaStub() {
  return {
    chatMessage: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'm2', role: 'assistant', content: '我在', createdAt: NEWER },
        { id: 'm1', role: 'user', content: '有点累', createdAt: OLDER },
      ]),
    },
  };
}

describe('ChatHistoryService.messages', () => {
  it('takes the most recent page and hands it back oldest first', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await expect(service.messages('user-1')).resolves.toEqual({
      messages: [
        { id: 'm1', role: 'user', content: '有点累', createdAt: OLDER },
        { id: 'm2', role: 'assistant', content: '我在', createdAt: NEWER },
      ],
    });
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_DEFAULT_LIMIT,
    });
  });

  it('caps the page size', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await service.messages('user-1', { limit: '999' });

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: HISTORY_MAX_LIMIT }),
    );
  });

  it('honours a smaller page size', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await service.messages('user-1', { limit: 5 });

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('pages before a timestamp', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await service.messages('user-1', { before: '2026-10-12T09:05:00+08:00' });

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', createdAt: { lt: NEWER } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_DEFAULT_LIMIT,
    });
  });

  it('rejects a cursor that is not a timestamp', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await expect(
      service.messages('user-1', { before: 'yesterday' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });
});
