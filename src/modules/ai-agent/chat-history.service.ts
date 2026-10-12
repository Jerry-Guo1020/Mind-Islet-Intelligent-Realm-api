import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseIsoDate, parseLimit } from '../../common/validation';

export const HISTORY_DEFAULT_LIMIT = 20;
export const HISTORY_MAX_LIMIT = 50;

/** 精灵对话的历史记录。分页按时间倒着取，返回时按正序，方便直接渲染。 */
@Injectable()
export class ChatHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async messages(
    userId: string,
    query: { limit?: unknown; before?: unknown } = {},
  ) {
    const limit = parseLimit(
      query.limit,
      HISTORY_DEFAULT_LIMIT,
      HISTORY_MAX_LIMIT,
    );
    const before = parseIsoDate(query.before, 'before');

    const rows = await this.prisma.chatMessage.findMany({
      where: { userId, ...(before ? { createdAt: { lt: before } } : {}) },
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
}
