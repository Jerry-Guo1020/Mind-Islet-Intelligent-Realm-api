import { BadRequestException, ConflictException } from '@nestjs/common';
import { MoodType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { RecordsService } from './records.service';

const SNAPSHOT = {
  createdAt: new Date('2026-10-01T00:30:00+08:00'),
  daysOnIsland: 12,
  totalCheckIns: 3,
  streak: 2,
  checkedInToday: true,
  growthStage: 'sprout' as const,
};

function progressStub() {
  return { snapshot: jest.fn().mockResolvedValue(SNAPSHOT) };
}

function prismaStub() {
  const record = {
    id: 'record-1',
    moodType: MoodType.anxious,
    content: '明天要汇报',
    aiReply: '心里装着事的时候，先陪自己站一会儿。',
    checkInDate: '2026-10-12',
    createdAt: new Date('2026-10-12T10:00:00+08:00'),
  };
  const placement = { create: jest.fn().mockResolvedValue(null) };
  return {
    record,
    placement,
    checkInRecord: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((run: (tx: unknown) => unknown) =>
      run({
        checkInRecord: { create: jest.fn().mockResolvedValue(record) },
        islandProgress: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue(null),
        },
        islandPlacement: placement,
        graphNode: { upsert: jest.fn().mockResolvedValue(null) },
      }),
    ),
  };
}

describe('RecordsService', () => {
  it('rejects a second check-in on the same Shanghai date', async () => {
    const prisma = {
      checkInRecord: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
      },
    };
    const encouragement = { write: jest.fn() };
    const service = new RecordsService(
      prisma as never,
      encouragement,
      progressStub() as unknown as ProgressService,
    );

    await expect(
      service.create('user-1', {
        moodType: MoodType.calm,
        content: '今天考试',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(encouragement.write).not.toHaveBeenCalled();
  });

  it('returns the first tree and the island growth after a check-in', async () => {
    const prisma = prismaStub();
    const encouragement = { write: jest.fn().mockResolvedValue('我陪你') };
    const progress = progressStub();
    const service = new RecordsService(
      prisma as unknown as PrismaService,
      encouragement,
      progress as unknown as ProgressService,
    );

    const result = await service.create(
      'user-1',
      { moodType: MoodType.anxious, content: '明天要汇报' },
      new Date('2026-10-12T10:00:00+08:00'),
    );

    expect(result).toEqual({
      record: prisma.record,
      settlement: {
        grantedTree: true,
        delta: { happy: 0, disappoint: 10 },
        happyPoints: 0,
        disappointPoints: 10,
        consecutiveCheckInDays: 1,
      },
      keywords: ['明天要汇报'],
      moodLabel: '焦虑',
      growthStage: 'sprout',
      growthLabel: '萌芽',
      totalCheckIns: 3,
      streak: 2,
    });
    expect(prisma.placement.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        season: 'spring',
        itemId: 'tree',
        source: 'first_checkin',
      },
    });
    expect(progress.snapshot).toHaveBeenCalledWith(
      'user-1',
      new Date('2026-10-12T10:00:00+08:00'),
    );
  });

  it('refuses an unknown mood before writing anything', async () => {
    const prisma = prismaStub();
    const service = new RecordsService(
      prisma as unknown as PrismaService,
      { write: jest.fn() },
      progressStub() as unknown as ProgressService,
    );

    await expect(
      service.create('user-1', {
        moodType: 'happy' as MoodType,
        content: '还行',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
