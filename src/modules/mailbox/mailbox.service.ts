import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { moodLabel, MOOD_ORDER } from '../../common/mood';
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
    const where = this.where(userId, query);
    const [records, letters] = await Promise.all([
      this.prisma.checkInRecord.findMany({
        where,
        include: { nodes: true },
        orderBy: { createdAt: 'asc' },
      }),
      // 标题组的「N 封信」是这段时间的信件总数，**包括一句关键词都没抽出来的信**。
      // 不能拿 Σcount 当信数（一封信可以带好几个关键词），也不能拿 records.length
      // （那是「有节点的信」）。所以单独数一次，和「全部来信」列表的长度对齐。
      this.prisma.checkInRecord.count({ where }),
    ]);
    const nodes = new Map<
      string,
      { id: string; keyword: string; count: number }
    >();
    const edges = new Map<
      string,
      { source: string; target: string; weight: number }
    >();
    for (const record of records) {
      // 用 Map 去重再排序：同一封信里重复的关键词如果直接 sort，会排成相邻的
      // 两个相同 id，下面两两配对就会造出一条自己指向自己的边。
      const keywords = new Map(
        record.nodes.map((node) => [node.id, node.keyword]),
      );
      const ids = [...keywords.keys()].sort();
      for (const id of ids) {
        const current = nodes.get(id);
        if (current) current.count += 1;
        else nodes.set(id, { id, keyword: keywords.get(id) ?? '', count: 1 });
      }
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const key = `${ids[i]}:${ids[j]}`;
          const current = edges.get(key);
          if (current) current.weight += 1;
          else
            edges.set(key, {
              source: ids[i],
              target: ids[j],
              weight: 1,
            });
        }
      }
    }
    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      totals: { letters, keywords: nodes.size },
    };
  }

  /**
   * 成长树那 5 个情绪枝头：这段时间每种情绪各记了几次。
   *
   * **恒定 5 条、恒定顺序（MOOD_ORDER）**，一次都没记过的情绪也在里面、count 为 0。
   * 「对应打卡里的那 5 种情况」意思是集合固定：前端拿到就直接摆，不用自己补缺失的
   * 那几档 —— 补漏这种话两边各写一次，迟早只补一处，然后树上就少一个圈。
   *
   * totals.letters 就是 5 个 count 的和，单独给是为了和 /letters 的「N 封信」对齐：
   * 那个数不分情绪，前端写统计行时用的是它，自己相加只是傅底。
   *
   * 注意 where 里也会带上 query.mood（如果有）—— 那就只会剩一个非 0 档。
   * 这是故意的：筛选参数对每个接口应该是同一套语义，不在这里开特例。
   */
  async moods(userId: string, query: MailboxQuery) {
    const where = this.where(userId, query);
    const [groups, letters] = await Promise.all([
      this.prisma.checkInRecord.groupBy({
        by: ['moodType'],
        where,
        _count: true,
      }),
      this.prisma.checkInRecord.count({ where }),
    ]);
    const counts = new Map(
      groups.map((group) => [group.moodType, group._count]),
    );
    return {
      moods: MOOD_ORDER.map((mood) => ({
        moodType: mood,
        moodLabel: moodLabel(mood),
        count: counts.get(mood) ?? 0,
      })),
      totals: { letters },
    };
  }

  async letters(userId: string, nodeId: string, query: MailboxQuery) {
    const node = await this.prisma.graphNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('关键词不存在');
    return this.list(userId, query, { nodes: { some: { id: nodeId } } });
  }

  /**
   * 一整个树洞的来信（不按关键词筛）。
   *
   * 前端原来是自己拉图、再按每个关键词并发打 N 次 nodes/:id/letters、
   * 最后在本地合并去重（utils/mailbox-flow.js 的 mergeMailboxLetters）。
   * 20 个关键词就是 20 次往返，还依赖「每封信都至少有一个关键词」这个不成立的假设。
   */
  async allLetters(userId: string, query: MailboxQuery) {
    return this.list(userId, query, {});
  }

  /** 两条来信列表唯一的分歧就是 extra，这样字段和排序永远不会漂。 */
  private async list(
    userId: string,
    query: MailboxQuery,
    extra: Prisma.CheckInRecordWhereInput,
  ) {
    const records = await this.prisma.checkInRecord.findMany({
      where: { ...this.where(userId, query), ...extra },
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
