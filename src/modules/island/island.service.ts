import { Injectable, NotFoundException } from '@nestjs/common';
import { MoodType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { shanghaiDate } from '../../common/crypto.util';

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

  async weather(userId: string, now = new Date()) {
    const record = await this.prisma.checkInRecord.findUnique({
      where: { userId_checkInDate: { userId, checkInDate: shanghaiDate(now) } },
    });
    const moodType = record?.moodType ?? MoodType.calm;
    return {
      moodType,
      weather:
        moodType === MoodType.anxious || moodType === MoodType.sad
          ? 'rain'
          : 'sunny',
      checkedIn: Boolean(record),
    };
  }
}

function toAssetView(asset: {
  id: string;
  assetType: string;
  posX: number;
  posY: number;
  zIndex: number;
  imgUrl: string;
  record: { checkInDate: string; moodType: MoodType; createdAt: Date };
}) {
  return {
    id: asset.id,
    assetType: asset.assetType,
    posX: asset.posX,
    posY: asset.posY,
    zIndex: asset.zIndex,
    imgUrl: asset.imgUrl,
    checkInDate: asset.record.checkInDate,
    moodType: asset.record.moodType,
    createdAt: asset.record.createdAt,
  };
}
