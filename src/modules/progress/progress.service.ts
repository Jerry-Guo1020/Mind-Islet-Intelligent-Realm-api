import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { shanghaiDate } from '../../common/crypto.util';
import {
  currentStreak,
  daysOnIsland,
  growthStage,
  type GrowthStage,
} from './progress';

export interface ProgressSnapshot {
  createdAt: Date;
  daysOnIsland: number;
  totalCheckIns: number;
  streak: number;
  checkedInToday: boolean;
  growthStage: GrowthStage;
}

/**
 * 打卡统计的唯一实现。个人中心与打卡接口都从这里取，
 * 避免两处各算一遍「连续天数」这类口径。
 */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(userId: string, now = new Date()): Promise<ProgressSnapshot> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const [totalCheckIns, records] = await Promise.all([
      this.prisma.checkInRecord.count({ where: { userId } }),
      this.prisma.checkInRecord.findMany({
        where: { userId },
        select: { checkInDate: true },
        orderBy: { checkInDate: 'desc' },
      }),
    ]);

    const today = shanghaiDate(now);
    const dates = records.map((record) => record.checkInDate);

    return {
      createdAt: user.createdAt,
      daysOnIsland: daysOnIsland(user.createdAt, now),
      totalCheckIns,
      streak: currentStreak(dates, today),
      checkedInToday: dates.includes(today),
      growthStage: growthStage(totalCheckIns),
    };
  }
}
