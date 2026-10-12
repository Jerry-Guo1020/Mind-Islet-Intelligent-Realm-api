import { AssetType, MoodType } from '@prisma/client';
import { IslandService } from './island.service';

describe('IslandService.weather', () => {
  const now = new Date('2026-10-09T16:30:00.000Z');

  it('returns calm and sunny when the user has not checked in today', async () => {
    const prisma = {
      checkInRecord: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new IslandService(prisma as never);
    await expect(service.weather('user-1', now)).resolves.toEqual({
      moodType: MoodType.calm,
      moodLabel: '平静',
      weather: 'sunny',
      checkedIn: false,
    });
    expect(prisma.checkInRecord.findUnique).toHaveBeenCalledWith({
      where: {
        userId_checkInDate: { userId: 'user-1', checkInDate: '2026-10-10' },
      },
    });
  });

  it('returns rain for anxious and sad', async () => {
    const prisma = {
      checkInRecord: {
        findUnique: jest.fn().mockResolvedValue({ moodType: MoodType.sad }),
      },
    };
    const service = new IslandService(prisma as never);
    await expect(service.weather('user-1', now)).resolves.toMatchObject({
      moodType: MoodType.sad,
      moodLabel: '悲伤',
      weather: 'rain',
      checkedIn: true,
    });
  });
});

describe('IslandService.listAssets', () => {
  const createdAt = new Date('2026-10-12T10:00:00+08:00');

  function prismaWith(assetType: AssetType) {
    return {
      islandAsset: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'asset-1',
            assetType,
            posX: 1.5,
            posY: 0,
            zIndex: 1,
            imgUrl: 'https://r2.example.com/assets/tree.png',
            record: {
              checkInDate: '2026-10-12',
              moodType: MoodType.anxious,
              createdAt,
            },
          },
        ]),
      },
    };
  }

  it('adds the Chinese asset name, the type label and the mood label', async () => {
    const service = new IslandService(prismaWith(AssetType.tree) as never);

    await expect(service.listAssets('user-1')).resolves.toEqual([
      {
        id: 'asset-1',
        assetType: AssetType.tree,
        assetName: '雨树',
        assetTypeLabel: '植物',
        posX: 1.5,
        posY: 0,
        zIndex: 1,
        imgUrl: 'https://r2.example.com/assets/tree.png',
        checkInDate: '2026-10-12',
        moodType: MoodType.anxious,
        moodLabel: '焦虑',
        createdAt,
      },
    ]);
  });

  it('names a blue house for a sad day', async () => {
    const service = new IslandService(
      prismaWith(AssetType.house_blue) as never,
    );
    const [asset] = await service.listAssets('user-1');

    expect(asset.assetName).toBe('蓝色小屋');
    expect(asset.assetTypeLabel).toBe('房屋');
  });
});

describe('IslandService.getAsset', () => {
  it('rejects an asset that belongs to someone else', async () => {
    const prisma = {
      islandAsset: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new IslandService(prisma as never);

    await expect(service.getAsset('user-1', 'asset-9')).rejects.toThrow(
      '资产不存在',
    );
    expect(prisma.islandAsset.findFirst).toHaveBeenCalledWith({
      where: { id: 'asset-9', userId: 'user-1' },
      include: { record: true },
    });
  });
});
