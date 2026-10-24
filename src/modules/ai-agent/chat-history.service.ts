import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { shanghaiDate } from '../../common/crypto.util';
import { parseIsoDate, parseLimit } from '../../common/validation';

export const HISTORY_DEFAULT_LIMIT = 20;
export const HISTORY_MAX_LIMIT = 50;
/** 含今天，一共留 7 个上海自然日。 */
export const HISTORY_KEEP_DAYS = 7;

/** 保留窗口的起点：上海今天往前数 6 天的 00:00。 */
export function historyCutoff(now = new Date()): Date {
  const day = shanghaiDate(now);
  const start = new Date(`${day}T00:00:00+08:00`);
  start.setTime(start.getTime() - (HISTORY_KEEP_DAYS - 1) * 24 * 60 * 60 * 1000);
  return start;
}

/** 精灵对话的历史记录。只保留最近一周，分页按时间倒着取，返回时按正序。 */
@Injectable()
export class ChatHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async messages(
    userId: string,
    query: { limit?: unknown; before?: unknown; since?: unknown } = {},
    now = new Date(),
  ) {
    const limit = parseLimit(
      query.limit,
      HISTORY_DEFAULT_LIMIT,
      HISTORY_MAX_LIMIT,
    );
    const before = parseIsoDate(query.before, 'before');
    const since = parseIsoDate(query.since, 'since');
    const cutoff = historyCutoff(now);
    const from = since && since > cutoff ? since : cutoff;

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        userId,
        createdAt: {
          gte: from,
          ...(before ? { lt: before } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      messages: rows.reverse().map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt,
      })),
    };
  }

  /** 删掉窗口之外的对话。谁来查历史就顺手清一次，不依赖定时任务。 */
  async purgeExpired(now = new Date()) {
    const result = await this.prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: historyCutoff(now) } },
    });
    return result.count;
  }
}
