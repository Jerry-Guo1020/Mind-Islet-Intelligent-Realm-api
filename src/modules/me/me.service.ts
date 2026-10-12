import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseAvatarUrl,
  parseBoolean,
  parseNickname,
  parseReminderTime,
} from '../../common/validation';
import { growthLabel, type GrowthStage } from '../progress/progress';
import { ProgressService } from '../progress/progress.service';

/** 打开提醒但没说几点时，默认晚上八点。 */
export const DEFAULT_REMINDER_TIME = '20:00';

export interface MeOverview {
  id: string;
  nickname: string;
  avatar: string;
  createdAt: Date;
  spiritOnboarded: boolean;
  daysOnIsland: number;
  totalCheckIns: number;
  streak: number;
  checkedInToday: boolean;
  growthStage: GrowthStage;
  growthLabel: string;
}

export interface MeSettings {
  reminderEnabled: boolean;
  reminderTime: string | null;
}

/** 个人中心。统计部分全部来自 ProgressService，这里只管资料与偏好。 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
  ) {}

  async overview(userId: string, now = new Date()): Promise<MeOverview> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const snapshot = await this.progress.snapshot(userId, now);

    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      createdAt: user.createdAt,
      spiritOnboarded: user.spiritOnboarded,
      daysOnIsland: snapshot.daysOnIsland,
      totalCheckIns: snapshot.totalCheckIns,
      streak: snapshot.streak,
      checkedInToday: snapshot.checkedInToday,
      growthStage: snapshot.growthStage,
      growthLabel: growthLabel(snapshot.growthStage),
    };
  }

  async updateProfile(
    userId: string,
    input: { nickname?: unknown; avatar?: unknown } = {},
    now = new Date(),
  ): Promise<MeOverview> {
    const data: { nickname?: string; avatar?: string } = {};
    if (input.nickname !== undefined) {
      data.nickname = parseNickname(input.nickname);
    }
    if (input.avatar !== undefined) {
      data.avatar = parseAvatarUrl(input.avatar);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('nickname 与 avatar 至少要改一个');
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.overview(userId, now);
  }

  async settings(userId: string): Promise<MeSettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { reminderEnabled: true, reminderTime: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return {
      reminderEnabled: user.reminderEnabled,
      reminderTime: user.reminderTime,
    };
  }

  async updateSettings(
    userId: string,
    input: { reminderEnabled?: unknown; reminderTime?: unknown } = {},
  ): Promise<MeSettings> {
    const data: { reminderEnabled?: boolean; reminderTime?: string } = {};
    if (input.reminderEnabled !== undefined) {
      data.reminderEnabled = parseBoolean(
        input.reminderEnabled,
        'reminderEnabled',
      );
    }
    if (input.reminderTime !== undefined) {
      data.reminderTime = parseReminderTime(input.reminderTime);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'reminderEnabled 与 reminderTime 至少要改一个',
      );
    }

    // 开着提醒却没有时间会让客户端无从下手，这里补上默认值。
    if (data.reminderEnabled === true && data.reminderTime === undefined) {
      const current = await this.settings(userId);
      data.reminderTime = current.reminderTime ?? DEFAULT_REMINDER_TIME;
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.settings(userId);
  }

  /** 精灵引导只做一次，重复调用不算错。 */
  async markSpiritOnboarded(
    userId: string,
  ): Promise<{ spiritOnboarded: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { spiritOnboarded: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    if (!user.spiritOnboarded) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { spiritOnboarded: true },
      });
    }
    return { spiritOnboarded: true };
  }
}
