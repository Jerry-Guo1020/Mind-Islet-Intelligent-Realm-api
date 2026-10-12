import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { moodLabel } from '../../common/mood';
import { parseMonth, parseYear } from '../../common/validation';
import { parseMood } from '../records/records.service';

export interface MailboxQuery {
  year?: string;
  month?: string;
  mood?: string;
}

@Injectable()
export class MailboxService {
  constructor(private readonly prisma: PrismaService) {}

  async graph(userId: string, query: MailboxQuery) {
    const records = await this.prisma.checkInRecord.findMany({
      where: this.where(userId, query),
      include: { nodes: true },
      orderBy: { createdAt: 'asc' },
    });
    const nodes = new Map<string, { id: string; keyword: string }>();
    const edges: { source: string; target: string }[] = [];
    const seen = new Set<string>();
    for (const record of records) {
      for (const node of record.nodes)
        nodes.set(node.id, { id: node.id, keyword: node.keyword });
      const ids = record.nodes.map((node) => node.id).sort();
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const key = `${ids[i]}:${ids[j]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ source: ids[i], target: ids[j] });
        }
      }
    }
    return { nodes: [...nodes.values()], edges };
  }

  async letters(userId: string, nodeId: string, query: MailboxQuery) {
    const node = await this.prisma.graphNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('关键词不存在');
    const records = await this.prisma.checkInRecord.findMany({
      where: { ...this.where(userId, query), nodes: { some: { id: nodeId } } },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => ({
      id: record.id,
      moodType: record.moodType,
      moodLabel: moodLabel(record.moodType),
      excerpt: record.content.slice(0, 48),
      checkInDate: record.checkInDate,
      createdAt: record.createdAt,
    }));
  }

  async letter(userId: string, recordId: string, query: MailboxQuery) {
    const record = await this.prisma.checkInRecord.findFirst({
      where: { ...this.where(userId, query), id: recordId },
      include: { nodes: true },
    });
    if (!record) throw new NotFoundException('信件不存在');
    return {
      id: record.id,
      moodType: record.moodType,
      moodLabel: moodLabel(record.moodType),
      content: record.content,
      aiReply: record.aiReply,
      checkInDate: record.checkInDate,
      createdAt: record.createdAt,
      keywords: record.nodes.map((node) => node.keyword),
    };
  }

  private where(
    userId: string,
    query: MailboxQuery,
  ): Prisma.CheckInRecordWhereInput {
    const where: Prisma.CheckInRecordWhereInput = { userId };
    if (query.mood) where.moodType = parseMood(query.mood);
    const year = parseYear(query.year);
    const month = parseMonth(query.month);
    if (year) {
      where.checkInDate = {
        startsWith: month ? `${year}-${month}` : `${year}-`,
      };
    }
    return where;
  }
}
