import { BadRequestException } from '@nestjs/common';
import {
  ChatHistoryService,
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
  historyCutoff,
} from './chat-history.service';

const NOW = new Date('2026-10-12T10:00:00+08:00');
const CUTOFF = historyCutoff(NOW);
const OLDER = new Date('2026-10-12T09:00:00+08:00');
const NEWER = new Date('2026-10-12T09:05:00+08:00');

function prismaStub() {
  return {
    chatMessage: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'm2', role: 'assistant', content: '我在', createdAt: NEWER },
        { id: 'm1', role: 'user', content: '有点累', createdAt: OLDER },
      ]),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  };
}

describe('ChatHistoryService.messages', () => {
  it('takes the most recent page and hands it back oldest first', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await expect(service.messages('user-1', {}, NOW)).resolves.toEqual({
      messages: [
        { id: 'm1', role: 'user', content: '有点累', createdAt: OLDER },
        { id: 'm2', role: 'assistant', content: '我在', createdAt: NEWER },
      ],
    });
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', createdAt: { gte: CUTOFF } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_DEFAULT_LIMIT,
    });
  });

  it('caps the page size', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await service.messages('user-1', { limit: '999' }, NOW);

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: HISTORY_MAX_LIMIT }),
    );
  });

  it('honours a smaller page size', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await service.messages('user-1', { limit: 5 }, NOW);

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('pages before a timestamp', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await service.messages('user-1', { before: '2026-10-12T09:05:00+08:00' }, NOW);

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        createdAt: { gte: CUTOFF, lt: NEWER },
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_DEFAULT_LIMIT,
    });
  });

  it('does not let since reach earlier than the one-week window', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await service.messages('user-1', { since: '2026-01-01T00:00:00+08:00' }, NOW);

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', createdAt: { gte: CUTOFF } },
      }),
    );
  });

  it('deletes messages older than the window', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await expect(service.purgeExpired(NOW)).resolves.toBe(3);
    expect(prisma.chatMessage.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: CUTOFF } },
    });
  });

  it('rejects a cursor that is not a timestamp', async () => {
    const prisma = prismaStub();
    const service = new ChatHistoryService(prisma as never);

    await expect(
      service.messages('user-1', { before: 'yesterday' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });
});
