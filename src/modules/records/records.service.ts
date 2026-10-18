import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { MoodType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { shanghaiDate } from '../../common/crypto.util';
import { moodLabel } from '../../common/mood';
import { growthLabel } from '../progress/progress';
import { ProgressService } from '../progress/progress.service';
import type { EncouragementWriter } from './encouragement';
import { extractKeywords } from './keywords';
import { IslandRuleError, emptyIsland, settleCheckIn, type IslandState } from '../island/island-rules';

export const ENCOURAGEMENT_WRITER = 'ENCOURAGEMENT_WRITER';

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
    private readonly progress: ProgressService,
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
    const keywords = extractKeywords(content);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const record = await tx.checkInRecord.create({
          data: {
            userId,
            checkInDate,
            moodType,
            content,
            aiReply,
          },
        });
        const current = await tx.islandProgress.findUnique({ where: { userId } });
        const placements = current
          ? await tx.islandPlacement.findMany({ where: { userId } })
          : [];
        const before: IslandState = current
          ? {
              happyPoints: current.happyPoints,
              disappointPoints: current.disappointPoints,
              totalCheckIns: current.totalCheckIns,
              consecutiveCheckInDays: current.consecutiveCheckInDays,
              lastCheckInDate: current.lastCheckInDate,
              lastMood: current.lastMood,
              season: current.season,
              placements: placements.map((item) => ({
                season: item.season,
                itemId: item.itemId,
                source: item.source,
              })),
              specialReward: current.specialReward,
            }
          : emptyIsland();
        const settled = settleCheckIn(before, moodType, checkInDate);
        await tx.islandProgress.upsert({
          where: { userId },
          create: { userId, ...progressData(settled.state) },
          update: progressData(settled.state),
        });
        if (settled.grantedTree) {
          await tx.islandPlacement.create({
            data: {
              userId,
              season: settled.state.season as never,
              itemId: 'tree',
              source: 'first_checkin',
            },
          });
        }
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
          settlement: {
            grantedTree: settled.grantedTree,
            delta: settled.delta,
            happyPoints: settled.state.happyPoints,
            disappointPoints: settled.state.disappointPoints,
            consecutiveCheckInDays: settled.state.consecutiveCheckInDays,
          },
          keywords,
        };
      });
      // 打卡成功后岛屿会长大，把新的成长状态一并返回，避免客户端再拉一次。
      const snapshot = await this.progress.snapshot(userId, now);
      return {
        ...created,
        moodLabel: moodLabel(moodType),
        growthStage: snapshot.growthStage,
        growthLabel: growthLabel(snapshot.growthStage),
        totalCheckIns: snapshot.totalCheckIns,
        streak: snapshot.streak,
      };
    } catch (error) {
      if (error instanceof IslandRuleError && error.reason === 'already_checked_in') {
        throw new ConflictException('今天已经打过卡了');
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('今天已经打过卡了');
      }
      throw error;
    }
  }
}

function progressData(state: IslandState) {
  return {
    happyPoints: state.happyPoints,
    disappointPoints: state.disappointPoints,
    totalCheckIns: state.totalCheckIns,
    consecutiveCheckInDays: state.consecutiveCheckInDays,
    lastCheckInDate: state.lastCheckInDate,
    lastMood: state.lastMood as MoodType | null,
    season: state.season as never,
    specialReward: state.specialReward,
  };
}

export function parseMood(value: string): MoodType {
  if (!Object.values(MoodType).includes(value as MoodType)) {
    throw new BadRequestException('moodType is invalid');
  }
  return value as MoodType;
}

