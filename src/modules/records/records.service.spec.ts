import { BadRequestException, ConflictException } from '@nestjs/common';
import { MoodType, Prisma } from '@prisma/client';
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

function viWait(ready: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (ready()) {
        resolve();
        return;
      }
      if (Date.now() - started > 1000) {
        reject(new Error('timed out waiting'));
        return;
      }
      setTimeout(tick, 0);
    };
    tick();
  });
}

function prismaStub() {
  const gate = { started: false };
  const record = {
    id: 'record-1',
    moodType: MoodType.anxious,
    content: '明天要汇报',
    aiReply: '我陪你',
    checkInDate: '2026-10-12',
    createdAt: new Date('2026-10-12T10:00:00+08:00'),
  };
  const placement = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const tx: {
    checkInRecord: { create: jest.Mock };
    islandProgress: { findUnique: jest.Mock; upsert: jest.Mock };
    islandPlacement: { createMany: jest.Mock; findMany: jest.Mock };
    graphNode: { upsert: jest.Mock; update: jest.Mock };
  } = {
    checkInRecord: { create: jest.fn().mockResolvedValue(record) },
    islandProgress: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(null),
    },
    islandPlacement: placement,
    graphNode: {
      upsert: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(null),
    },
  };
  return {
    record,
    placement,
    gate,
    tx,
    checkInRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn((run: (tx: unknown) => unknown) => {
      gate.started = true;
      return run(tx);
    }),
  };
}

function uniqueViolation(target: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target },
  });
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

  it('keeps the record when the reply is slow, so a retry is the same check-in', async () => {
    const prisma = prismaStub();
    let reply: (value: string) => void = () => undefined;
    const encouragement = {
      write: jest.fn(
        () =>
          new Promise<string>((resolve) => {
            reply = resolve;
          }),
      ),
    };
    const service = new RecordsService(
      prisma as unknown as PrismaService,
      encouragement,
      progressStub() as unknown as ProgressService,
    );

    const pending = service.create(
      'user-1',
      { moodType: MoodType.anxious, content: '明天要汇报' },
      new Date('2026-10-12T10:00:00+08:00'),
    );
    await viWait(() => prisma.gate.started);
    expect(prisma.$transaction).toHaveBeenCalled();

    prisma.checkInRecord.findUnique.mockResolvedValue({ id: 'record-1' });
    await expect(
      service.create('user-1', {
        moodType: MoodType.calm,
        content: '再试一次',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    reply('我陪你');
    await expect(pending).resolves.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      record: expect.objectContaining({ id: 'record-1', aiReply: '我陪你' }),
    });
  });

  it('still accepts the check-in when the reply cannot be saved', async () => {
    const prisma = prismaStub();
    prisma.checkInRecord.update.mockRejectedValue(new Error('db down'));
    const service = new RecordsService(
      prisma as unknown as PrismaService,
      { write: jest.fn().mockResolvedValue('我陪你') },
      progressStub() as unknown as ProgressService,
    );

    const result = await service.create('user-1', {
      moodType: MoodType.calm,
      content: '今天考试',
    });

    expect(result.record.id).toBe('record-1');
    expect(result.record.aiReply).toBeNull();
  });

  it('keeps the check-in when two users race to create the same keyword', async () => {
    const prisma = prismaStub();
    prisma.tx.graphNode.upsert
      .mockRejectedValueOnce(uniqueViolation('graph_nodes_keyword_key'))
      .mockResolvedValue(null);
    const service = new RecordsService(
      prisma as unknown as PrismaService,
      { write: jest.fn().mockResolvedValue('我陪你') },
      progressStub() as unknown as ProgressService,
    );

    const result = await service.create('user-1', {
      moodType: MoodType.calm,
      content: '今天考试',
    });

    expect(result.record.id).toBe('record-1');
    expect(prisma.tx.graphNode.update).toHaveBeenCalledWith({
      where: { keyword: '考试' },
      data: { records: { connect: { id: 'record-1' } } },
    });
  });

  it('still treats a duplicate on the check-in date as already checked in', async () => {
    const prisma = prismaStub();
    prisma.tx.checkInRecord.create.mockRejectedValue(
      uniqueViolation('check_in_records_user_id_check_in_date_key'),
    );
    const service = new RecordsService(
      prisma as unknown as PrismaService,
      { write: jest.fn() },
      progressStub() as unknown as ProgressService,
    );

    await expect(
      service.create('user-1', {
        moodType: MoodType.calm,
        content: '今天考试',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('still checks in when progress forgot the tree but the placement exists', async () => {
    const prisma = prismaStub();
    prisma.tx.islandProgress.findUnique.mockResolvedValue({
      happyPoints: 0,
      disappointPoints: 0,
      totalCheckIns: 0,
      consecutiveCheckInDays: 30,
      lastCheckInDate: null,
      lastMood: null,
      season: 'spring',
      specialReward: null,
    });
    prisma.tx.islandPlacement.findMany.mockResolvedValue([
      { season: 'spring', itemId: 'tree', source: 'redeem' },
      { season: 'spring', itemId: 'house', source: 'redeem' },
    ]);
    const service = new RecordsService(
      prisma as unknown as PrismaService,
      { write: jest.fn().mockResolvedValue('我陪你') },
      progressStub() as unknown as ProgressService,
    );

    const result = await service.create('user-1', {
      moodType: MoodType.calm,
      content: '今天考试',
    });

    expect(result.record.id).toBe('record-1');
    expect(result.settlement.grantedTree).toBe(false);
    expect(prisma.placement.createMany).not.toHaveBeenCalled();
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
    expect(prisma.placement.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          season: 'spring',
          itemId: 'tree',
          source: 'first_checkin',
        },
      ],
      skipDuplicates: true,
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
