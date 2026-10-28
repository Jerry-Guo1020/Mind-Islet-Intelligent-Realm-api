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
import {
  IslandRuleError,
  emptyIsland,
  settleCheckIn,
  type IslandState,
} from '../island/island-rules';

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

    // 先把这一天占住再等回复。回复要问模型，客户端十秒就会放弃并重试；
    // 如果记录还没落库，第一次请求稍后写成功，重试就会被说成「今天已经打过卡了」，
    // 而用户看到的是提交失败、库里却有一条。
    const keywords = extractKeywords(content);
    let created: CreatedCheckIn;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        let record: {
          id: string;
          moodType: MoodType;
          content: string;
          checkInDate: string;
          createdAt: Date;
        };
        try {
          record = await tx.checkInRecord.create({
            data: {
              userId,
              checkInDate,
              moodType,
              content,
            },
          });
        } catch (error) {
          // 只有这一处 insert 的唯一键能代表「今天已经打过卡」。
          // 以前是整个事务里任何 P2002 都报这句话，于是关键词节点撞车也被
          // 说成「今天已经打过卡了」，而用户的这一天其实根本没写进去。
          if (isUniqueViolation(error)) throw new DuplicateCheckInError();
          throw error;
        }
        const current = await tx.islandProgress.findUnique({
          where: { userId },
        });
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
          try {
            await tx.graphNode.upsert({
              where: { keyword },
              update: { records: { connect: { id: record.id } } },
              create: { keyword, records: { connect: { id: record.id } } },
            });
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            // 关键词是全局唯一的，而这里的 upsert 是「先查再插」模拟出来的。
            // 两个用户同时写同一个词时，两边都会查不到，后插的那个撞唯一键。
            // 这不是重复打卡，把记录接到已经存在的那一行上就够了。
            await tx.graphNode.update({
              where: { keyword },
              data: { records: { connect: { id: record.id } } },
            });
          }
        }
        return {
          record: {
            id: record.id,
            moodType: record.moodType,
            content: record.content,
            aiReply: null as string | null,
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
      created.record.aiReply = await this.writeReply(created.record.id, {
        moodType,
        content,
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
      if (error instanceof DuplicateCheckInError) {
        throw new ConflictException('今天已经打过卡了');
      }
      if (
        error instanceof IslandRuleError &&
        error.reason === 'already_checked_in'
      ) {
        throw new ConflictException('今天已经打过卡了');
      }
      throw error;
    }
  }

  /**
   * 回复是附加的。模型超时或写不回去都不能把已经收下的这一天作废，
   * 页面自己有一句兜底。
   */
  private async writeReply(
    recordId: string,
    input: { moodType: MoodType; content: string },
  ): Promise<string | null> {
    try {
      const aiReply = await this.encouragement.write(input);
      await this.prisma.checkInRecord.update({
        where: { id: recordId },
        data: { aiReply },
      });
      return aiReply;
    } catch {
      return null;
    }
  }
}

interface CreatedCheckIn {
  record: {
    id: string;
    moodType: MoodType;
    content: string;
    aiReply: string | null;
    checkInDate: string;
    createdAt: Date;
  };
  settlement: {
    grantedTree: boolean;
    delta: { happy: number; disappoint: number };
    happyPoints: number;
    disappointPoints: number;
    consecutiveCheckInDays: number;
  };
  keywords: string[];
}

/** 只用来把「打卡那一条唯一键撞了」从其它 P2002 里分出来，别让它变成 409。 */
class DuplicateCheckInError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
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
