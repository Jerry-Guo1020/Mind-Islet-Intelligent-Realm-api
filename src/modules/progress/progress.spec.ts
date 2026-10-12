import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { currentStreak, daysOnIsland, growthStage } from './progress';
import { ProgressService } from './progress.service';

describe('growthStage', () => {
  it('treats a fresh island as barren', () => {
    expect(growthStage(0)).toBe('barren');
  });

  it('sprouts for the first week of check-ins', () => {
    expect(growthStage(1)).toBe('sprout');
    expect(growthStage(6)).toBe('sprout');
  });

  it('turns into an oasis from the seventh check-in', () => {
    expect(growthStage(7)).toBe('oasis');
    expect(growthStage(100)).toBe('oasis');
  });
});

describe('daysOnIsland', () => {
  const createdAt = new Date('2026-10-01T00:30:00+08:00');

  it('counts the signup day as day one', () => {
    expect(daysOnIsland(createdAt, new Date('2026-10-01T23:00:00+08:00'))).toBe(
      1,
    );
  });

  it('adds one day per Shanghai calendar day', () => {
    expect(daysOnIsland(createdAt, new Date('2026-10-03T23:00:00+08:00'))).toBe(
      3,
    );
  });

  it('uses Shanghai days, not UTC days', () => {
    // 2026-10-02 07:00 UTC is 2026-10-02 15:00 in Shanghai: still day two.
    expect(daysOnIsland(createdAt, new Date('2026-10-02T07:00:00Z'))).toBe(2);
  });
});

describe('currentStreak', () => {
  it('counts back from today when today is already checked in', () => {
    expect(
      currentStreak(['2026-10-12', '2026-10-11', '2026-10-10'], '2026-10-12'),
    ).toBe(3);
  });

  it('counts back from yesterday when today is not checked in yet', () => {
    expect(currentStreak(['2026-10-11', '2026-10-10'], '2026-10-12')).toBe(2);
  });

  it('drops to zero when yesterday is missing', () => {
    expect(currentStreak(['2026-10-10'], '2026-10-12')).toBe(0);
  });

  it('is zero without any check-in', () => {
    expect(currentStreak([], '2026-10-12')).toBe(0);
  });

  it('counts a single day', () => {
    expect(currentStreak(['2026-10-12'], '2026-10-12')).toBe(1);
  });

  it('stops at the first gap', () => {
    expect(
      currentStreak(['2026-10-12', '2026-10-11', '2026-10-09'], '2026-10-12'),
    ).toBe(2);
  });
});

function prismaStub(createdAt: Date | null, dates: string[]) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(createdAt ? { createdAt } : null),
    },
    checkInRecord: {
      count: jest.fn().mockResolvedValue(dates.length),
      findMany: jest
        .fn()
        .mockResolvedValue(dates.map((checkInDate) => ({ checkInDate }))),
    },
  };
}

describe('ProgressService', () => {
  function serviceWith(client: ReturnType<typeof prismaStub>) {
    return new ProgressService(client as unknown as PrismaService);
  }

  it('combines the counters into one snapshot', async () => {
    const createdAt = new Date('2026-10-01T00:30:00+08:00');
    const client = prismaStub(createdAt, ['2026-10-12', '2026-10-11']);
    const service = serviceWith(client);
    const snapshot = await service.snapshot(
      'user-1',
      new Date('2026-10-12T10:00:00+08:00'),
    );

    expect(snapshot).toEqual({
      createdAt,
      daysOnIsland: 12,
      totalCheckIns: 2,
      streak: 2,
      checkedInToday: true,
      growthStage: 'sprout',
    });
    expect(client.checkInRecord.count).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('reports no check-in today when today is missing from the dates', async () => {
    const createdAt = new Date('2026-10-01T00:30:00+08:00');
    const client = prismaStub(createdAt, ['2026-10-11']);
    const service = serviceWith(client);
    const snapshot = await service.snapshot(
      'user-1',
      new Date('2026-10-12T10:00:00+08:00'),
    );

    expect(snapshot.checkedInToday).toBe(false);
    expect(snapshot.streak).toBe(1);
  });

  it('rejects an unknown user', async () => {
    const client = prismaStub(null, []);
    const service = serviceWith(client);
    await expect(service.snapshot('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
