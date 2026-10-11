import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AssetType, MoodType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { shanghaiDate } from '../../common/crypto.util';
import type { EncouragementWriter } from './encouragement';
import { extractKeywords } from './keywords';

export const ENCOURAGEMENT_WRITER = 'ENCOURAGEMENT_WRITER';

const ASSET_BY_MOOD: Record<MoodType, AssetType> = {
  ecstatic: AssetType.flower,
  calm: AssetType.grass,
  tired: AssetType.house,
  anxious: AssetType.tree,
  sad: AssetType.house_blue,
};

const DEFAULT_IMAGES: Record<AssetType, string> = {
  flower: 'https://r2.example.com/assets/flower.png',
  grass: 'https://r2.example.com/assets/grass.png',
  tree: 'https://r2.example.com/assets/tree.png',
  house: 'https://r2.example.com/assets/house.png',
  house_blue: 'https://r2.example.com/assets/house-blue.png',
};

export interface CreateRecordInput {
  moodType: MoodType;
  content: string;
}

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENCOURAGEMENT_WRITER)
    private readonly encouragement: EncouragementWriter,
  ) {}

  async create(userId: string, input: CreateRecordInput, now = new Date()) {
    const moodType = parseMood(input.moodType);
    const content = input.content?.trim();
    if (!content) {
      throw new BadRequestException('content is required');
    }
    const checkInDate = shanghaiDate(now);
    const existing = await this.prisma.checkInRecord.findUnique({
      where: { userId_checkInDate: { userId, checkInDate } },
    });
    if (existing) {
      throw new ConflictException('今天已经打过卡了');
    }

    const aiReply = await this.encouragement.write({ moodType, content });
    const assetType = ASSET_BY_MOOD[moodType];
    const keywords = extractKeywords(content);
    const position = await this.nextPosition(userId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const record = await tx.checkInRecord.create({
          data: {
            userId,
            checkInDate,
            moodType,
            content,
            aiReply,
          },
        });
        const asset = await tx.islandAsset.create({
          data: {
            userId,
            recordId: record.id,
            assetType,
            posX: position.x,
            posY: position.y,
            zIndex: position.z,
            imgUrl: imageFor(assetType),
          },
        });
        for (const keyword of keywords) {
          await tx.graphNode.upsert({
            where: { keyword },
            update: { records: { connect: { id: record.id } } },
            create: { keyword, records: { connect: { id: record.id } } },
          });
        }
        return {
          record: {
            id: record.id,
            moodType: record.moodType,
            content: record.content,
            aiReply: record.aiReply,
            checkInDate: record.checkInDate,
            createdAt: record.createdAt,
          },
          asset: {
            id: asset.id,
            assetType: asset.assetType,
            posX: asset.posX,
            posY: asset.posY,
            zIndex: asset.zIndex,
            imgUrl: asset.imgUrl,
          },
          keywords,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('今天已经打过卡了');
      }
      throw error;
    }
  }

  private async nextPosition(userId: string) {
    const count = await this.prisma.islandAsset.count({ where: { userId } });
    return { x: (count % 5) * 1.5, y: Math.floor(count / 5) * 1.5, z: count };
  }
}

export function parseMood(value: string): MoodType {
  if (!Object.values(MoodType).includes(value as MoodType)) {
    throw new BadRequestException('moodType is invalid');
  }
  return value as MoodType;
}

export function imageFor(assetType: AssetType): string {
  const configured = process.env.ASSET_IMAGE_URLS ?? '';
  for (const pair of configured.split(',')) {
    const [type, url] = pair.split('|').map((item) => item.trim());
    if (type === assetType && url?.startsWith('https://')) return url;
  }
  return DEFAULT_IMAGES[assetType];
}
