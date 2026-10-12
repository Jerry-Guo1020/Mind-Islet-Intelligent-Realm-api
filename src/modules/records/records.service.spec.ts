import { BadRequestException, ConflictException } from '@nestjs/common';
import { AssetType, MoodType } from '@prisma/client';
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
  const asset = {
    id: 'asset-1',
    assetType: AssetType.tree,
    posX: 3,
    posY: 0,
    zIndex: 2,
    imgUrl: 'https://r2.example.com/assets/tree.png',
  };
  return {
    record,
    checkInRecord: { findUnique: jest.fn().mockResolvedValue(null) },
    islandAsset: { count: jest.fn().mockResolvedValue(2) },
    $transaction: jest.fn((run: (tx: unknown) => unknown) =>
      run({
        checkInRecord: { create: jest.fn().mockResolvedValue(record) },
        islandAsset: { create: jest.fn().mockResolvedValue(asset) },
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

  it('returns the asset wording and the island growth after a check-in', async () => {
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
      asset: {
        id: 'asset-1',
        assetType: AssetType.tree,
        posX: 3,
        posY: 0,
        zIndex: 2,
        imgUrl: 'https://r2.example.com/assets/tree.png',
        assetName: '雨树',
        assetTypeLabel: '植物',
      },
      keywords: ['明天要汇报'],
      moodLabel: '焦虑',
      assetName: '雨树',
      assetTypeLabel: '植物',
      assetRelation: '焦虑的时候，岛上会种下一棵陪你听雨的树。',
      growthStage: 'sprout',
      growthLabel: '萌芽',
      totalCheckIns: 3,
      streak: 2,
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
