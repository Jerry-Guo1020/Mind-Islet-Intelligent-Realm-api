import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetType, MoodType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { shanghaiDate } from '../../common/crypto.util';
import { ASSET_META } from '../../common/assetMeta';
import { moodLabel } from '../../common/mood';
import {
  IslandRuleError,
  IslandState,
  emptyIsland,
  redeemItem,
  switchSeason,
  weatherOf,
} from './island-rules';

@Injectable()
export class IslandService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssets(userId: string) {
    const assets = await this.prisma.islandAsset.findMany({
      where: { userId },
      include: { record: true },
      orderBy: { zIndex: 'asc' },
    });
    return assets.map(toAssetView);
  }

  async getAsset(userId: string, id: string) {
    const asset = await this.prisma.islandAsset.findFirst({
      where: { id, userId },
      include: { record: true },
    });
    if (!asset) throw new NotFoundException('资产不存在');
    return toAssetView(asset);
  }

  async state(userId: string, now = new Date()) {
    const progress = await this.ensureProgress(userId);
    const today = shanghaiDate(now);
    const checkedIn = progress.lastCheckInDate === today;
    const weather = weatherOf(progress.lastMood);
    return {
      ...progress,
      checkedIn,
      weather: weather.file,
      weatherLabel: weather.label,
      demoSkipDays: process.env.ISLAND_DEMO_SKIP_DAYS === 'true',
    };
  }

  async redeem(userId: string, itemId: string, season?: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.readState(userId, tx);
      try {
        const next = redeemItem(current, itemId, season).state;
        await this.writeState(userId, current, next, tx);
        return next;
      } catch (error) {
        throw this.asBadRequest(error);
      }
    });
  }

  async nextSeason(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.readState(userId, tx);
      try {
        const next = switchSeason(current, {
          demoSkipDays: process.env.ISLAND_DEMO_SKIP_DAYS === 'true',
        }).state;
        await this.writeState(userId, current, next, tx);
        return next;
      } catch (error) {
        throw this.asBadRequest(error);
      }
    });
  }

  private async ensureProgress(userId: string) {
    const existing = await this.prisma.islandProgress.findUnique({ where: { userId } });
    if (!existing) {
      await this.prisma.islandProgress.create({ data: { userId } });
    }
    return this.readState(userId, this.prisma);
  }

  private async readState(userId: string, db: PrismaLike): Promise<IslandState> {
    const progress = await db.islandProgress.findUnique({ where: { userId } });
    const placements = await db.islandPlacement.findMany({ where: { userId } });
    if (!progress) return emptyIsland();
    return {
      happyPoints: progress.happyPoints,
      disappointPoints: progress.disappointPoints,
      totalCheckIns: progress.totalCheckIns,
      consecutiveCheckInDays: progress.consecutiveCheckInDays,
      lastCheckInDate: progress.lastCheckInDate,
      lastMood: progress.lastMood,
      season: progress.season,
      specialReward: progress.specialReward,
      placements: placements.map((item) => ({
        season: item.season,
        itemId: item.itemId,
        source: item.source,
      })),
    };
  }

  private async writeState(userId: string, before: IslandState, next: IslandState, db: PrismaLike) {
    await db.islandProgress.update({
      where: { userId },
      data: {
        happyPoints: next.happyPoints,
        disappointPoints: next.disappointPoints,
        season: next.season as never,
        specialReward: next.specialReward,
      },
    });
    const added = next.placements.filter(
      (item) => !before.placements.some((old) => old.season === item.season && old.itemId === item.itemId),
    );
    for (const item of added) {
      await db.islandPlacement.create({
        data: { userId, season: item.season as never, itemId: item.itemId, source: item.source },
      });
    }
  }

  private asBadRequest(error: unknown) {
    if (error instanceof IslandRuleError) return new BadRequestException(error.reason);
    return error;
  }

  async weather(userId: string, now = new Date()) {
    const record = await this.prisma.checkInRecord.findUnique({
      where: { userId_checkInDate: { userId, checkInDate: shanghaiDate(now) } },
    });
    const moodType = record?.moodType ?? MoodType.calm;
    return {
      moodType,
      moodLabel: moodLabel(moodType),
      weather:
        moodType === MoodType.anxious || moodType === MoodType.sad
          ? 'rain'
          : 'sunny',
      checkedIn: Boolean(record),
    };
  }
}

interface PrismaLike {
  islandProgress: {
    findUnique: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<any>;
    create?: (args: unknown) => Promise<any>;
  };
  islandPlacement: {
    findMany: (args: unknown) => Promise<any[]>;
    create: (args: unknown) => Promise<any>;
  };
}

function toAssetView(asset: {
  id: string;
  assetType: AssetType;
  posX: number;
  posY: number;
  zIndex: number;
  imgUrl: string;
  record: { checkInDate: string; moodType: MoodType; createdAt: Date };
}) {
  const meta = ASSET_META[asset.assetType];
  return {
    id: asset.id,
    assetType: asset.assetType,
    assetName: meta.name,
    assetTypeLabel: meta.typeLabel,
    posX: asset.posX,
    posY: asset.posY,
    zIndex: asset.zIndex,
    imgUrl: asset.imgUrl,
    checkInDate: asset.record.checkInDate,
    moodType: asset.record.moodType,
    moodLabel: moodLabel(asset.record.moodType),
    createdAt: asset.record.createdAt,
  };
}
