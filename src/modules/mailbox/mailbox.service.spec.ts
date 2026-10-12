import { BadRequestException } from '@nestjs/common';
import { MoodType } from '@prisma/client';
import { MailboxService } from './mailbox.service';

describe('MailboxService.graph', () => {
  it('builds nodes and edges only from the filtered check-ins', async () => {
    const records = [
      {
        id: 'r1',
        nodes: [
          { id: 'n1', keyword: '考试' },
          { id: 'n2', keyword: '朋友' },
        ],
      },
    ];
    const prisma = {
      checkInRecord: { findMany: jest.fn().mockResolvedValue(records) },
    };
    const service = new MailboxService(prisma as never);
    await expect(
      service.graph('user-1', {
        year: '2026',
        month: '10',
        mood: MoodType.anxious,
      }),
    ).resolves.toEqual({
      nodes: [
        { id: 'n1', keyword: '考试' },
        { id: 'n2', keyword: '朋友' },
      ],
      edges: [{ source: 'n1', target: 'n2' }],
    });
    expect(prisma.checkInRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          moodType: MoodType.anxious,
          checkInDate: { startsWith: '2026-10' },
        },
      }),
    );
  });

  it('accepts a single digit month', async () => {
    const prisma = {
      checkInRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MailboxService(prisma as never);

    await service.graph('user-1', { year: '2026', month: '3' });

    expect(prisma.checkInRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', checkInDate: { startsWith: '2026-03' } },
      }),
    );
  });

  it('rejects a month outside the calendar', async () => {
    const prisma = {
      checkInRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MailboxService(prisma as never);

    await expect(
      service.graph('user-1', { year: '2026', month: '13' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.checkInRecord.findMany).not.toHaveBeenCalled();
  });

  it('rejects a year that is not four digits', async () => {
    const prisma = {
      checkInRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MailboxService(prisma as never);

    await expect(
      service.graph('user-1', { year: '26' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters the whole year when no month is given', async () => {
    const prisma = {
      checkInRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MailboxService(prisma as never);

    await service.graph('user-1', { year: '2026' });

    expect(prisma.checkInRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', checkInDate: { startsWith: '2026-' } },
      }),
    );
  });
});

describe('MailboxService.letters and letter', () => {
  const record = {
    id: 'r1',
    moodType: MoodType.tired,
    content: '今天加班到很晚',
    aiReply: '累了就先靠岸',
    checkInDate: '2026-10-12',
    createdAt: new Date('2026-10-12T22:00:00+08:00'),
    nodes: [{ keyword: '加班' }],
  };

  it('names the mood on every letter of a node', async () => {
    const prisma = {
      graphNode: { findUnique: jest.fn().mockResolvedValue({ id: 'n1' }) },
      checkInRecord: { findMany: jest.fn().mockResolvedValue([record]) },
    };
    const service = new MailboxService(prisma as never);

    await expect(service.letters('user-1', 'n1', {})).resolves.toEqual([
      {
        id: 'r1',
        moodType: MoodType.tired,
        moodLabel: '疲惫',
        excerpt: '今天加班到很晚',
        checkInDate: '2026-10-12',
        createdAt: record.createdAt,
      },
    ]);
  });

  it('names the mood on a single letter', async () => {
    const prisma = {
      checkInRecord: { findFirst: jest.fn().mockResolvedValue(record) },
    };
    const service = new MailboxService(prisma as never);

    await expect(service.letter('user-1', 'r1', {})).resolves.toMatchObject({
      id: 'r1',
      moodLabel: '疲惫',
      keywords: ['加班'],
    });
  });

  it('rejects a node that does not exist', async () => {
    const prisma = {
      graphNode: { findUnique: jest.fn().mockResolvedValue(null) },
      checkInRecord: { findMany: jest.fn() },
    };
    const service = new MailboxService(prisma as never);

    await expect(service.letters('user-1', 'missing', {})).rejects.toThrow(
      '关键词不存在',
    );
    expect(prisma.checkInRecord.findMany).not.toHaveBeenCalled();
  });
});
