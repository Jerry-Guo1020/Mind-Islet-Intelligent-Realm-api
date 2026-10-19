import { BadRequestException } from '@nestjs/common';
import { MoodType } from '@prisma/client';
import { MailboxService } from './mailbox.service';

describe('MailboxService.graph', () => {
  /** 三封信：r1 带「考试 + 朋友」，r2 也带「考试 + 朋友」，r3 只带「考试」。 */
  const records = [
    {
      id: 'r1',
      nodes: [
        { id: 'n1', keyword: '考试' },
        { id: 'n2', keyword: '朋友' },
      ],
    },
    {
      id: 'r2',
      nodes: [
        { id: 'n2', keyword: '朋友' },
        { id: 'n1', keyword: '考试' },
      ],
    },
    { id: 'r3', nodes: [{ id: 'n1', keyword: '考试' }] },
  ];

  const build = (rows: unknown[] = records, letters = 4) => {
    const prisma = {
      checkInRecord: {
        findMany: jest.fn().mockResolvedValue(rows),
        // 标题组的「N 封信」是信件总数，和有节点的信不是一回事：这里故意给 4，
        // 上面的 rows 只有 3 条，用来钉死「不许拿 Σcount 当信数」。
        count: jest.fn().mockResolvedValue(letters),
      },
    };
    return { prisma, service: new MailboxService(prisma as never) };
  };

  it('counts letters per keyword and co-occurrences per pair', async () => {
    const { service } = build();

    await expect(
      service.graph('user-1', {
        year: '2026',
        month: '10',
        mood: MoodType.anxious,
      }),
    ).resolves.toEqual({
      nodes: [
        { id: 'n1', keyword: '考试', count: 3 },
        { id: 'n2', keyword: '朋友', count: 2 },
      ],
      edges: [{ source: 'n1', target: 'n2', weight: 2 }],
      totals: { letters: 4, keywords: 2 },
    });
  });

  it('filters the whole graph by the same where as the letter count', async () => {
    const { prisma, service } = build([], 0);
    const where = {
      userId: 'user-1',
      moodType: MoodType.anxious,
      checkInDate: { startsWith: '2026-10' },
    };

    await service.graph('user-1', {
      year: '2026',
      month: '10',
      mood: MoodType.anxious,
    });

    expect(prisma.checkInRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    // 两条查询必须用同一个 where —— 分开写会漂，信数和图上节点就对不上了
    expect(prisma.checkInRecord.count).toHaveBeenCalledWith({ where });
  });

  it('does not turn a duplicated keyword inside one letter into a self edge', async () => {
    // graph_nodes 那张关联表理论上不会有重复，但 sort() 之后重复 id 会相邻，
    // 两两配对就会造出一条 n1 → n1 的自环；自环在图上是一条长度 0 的线。
    const { service } = build(
      [
        {
          id: 'r1',
          nodes: [
            { id: 'n1', keyword: '考试' },
            { id: 'n1', keyword: '考试' },
          ],
        },
      ],
      1,
    );

    await expect(service.graph('user-1', {})).resolves.toEqual({
      nodes: [{ id: 'n1', keyword: '考试', count: 1 }],
      edges: [],
      totals: { letters: 1, keywords: 1 },
    });
  });

  it('accepts a single digit month', async () => {
    const { prisma, service } = build([], 0);

    await service.graph('user-1', { year: '2026', month: '3' });

    expect(prisma.checkInRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', checkInDate: { startsWith: '2026-03' } },
      }),
    );
  });

  it('rejects a month outside the calendar', async () => {
    const { prisma, service } = build([], 0);

    await expect(
      service.graph('user-1', { year: '2026', month: '13' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.checkInRecord.findMany).not.toHaveBeenCalled();
  });

  it('rejects a year that is not four digits', async () => {
    const { prisma, service } = build([], 0);

    await expect(
      service.graph('user-1', { year: '26' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // 和 month=13 一样：参数不合法时一次库都不该碰
    expect(prisma.checkInRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.checkInRecord.count).not.toHaveBeenCalled();
  });

  it('filters the whole year when no month is given', async () => {
    const { prisma, service } = build([], 0);

    await service.graph('user-1', { year: '2026' });

    expect(prisma.checkInRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', checkInDate: { startsWith: '2026-' } },
      }),
    );
  });
});

describe('MailboxService.letters and letter', () => {
  const record = {
    id: 'r1',
    moodType: MoodType.tired,
    content: '今天加班到很晚',
    aiReply: '累了就先靠岸',
    checkInDate: '2026-10-12',
    createdAt: new Date('2026-10-12T22:00:00+08:00'),
    nodes: [{ keyword: '加班' }],
  };

  it('names the mood on every letter of a node', async () => {
    const prisma = {
      graphNode: { findUnique: jest.fn().mockResolvedValue({ id: 'n1' }) },
      checkInRecord: { findMany: jest.fn().mockResolvedValue([record]) },
    };
    const service = new MailboxService(prisma as never);

    await expect(service.letters('user-1', 'n1', {})).resolves.toEqual([
      {
        id: 'r1',
        moodType: MoodType.tired,
        moodLabel: '疲惫',
        excerpt: '今天加班到很晚',
        checkInDate: '2026-10-12',
        createdAt: record.createdAt,
      },
    ]);
  });

  it('names the mood on a single letter', async () => {
    const prisma = {
      checkInRecord: { findFirst: jest.fn().mockResolvedValue(record) },
    };
    const service = new MailboxService(prisma as never);

    await expect(service.letter('user-1', 'r1', {})).resolves.toMatchObject({
      id: 'r1',
      moodLabel: '疲惫',
      keywords: ['加班'],
    });
  });

  it('rejects a node that does not exist', async () => {
    const prisma = {
      graphNode: { findUnique: jest.fn().mockResolvedValue(null) },
      checkInRecord: { findMany: jest.fn() },
    };
    const service = new MailboxService(prisma as never);

    await expect(service.letters('user-1', 'missing', {})).rejects.toThrow(
      '关键词不存在',
    );
    expect(prisma.checkInRecord.findMany).not.toHaveBeenCalled();
  });

  it('lists every letter of the treehole without a keyword filter', async () => {
    const prisma = {
      checkInRecord: { findMany: jest.fn().mockResolvedValue([record]) },
    };
    const service = new MailboxService(prisma as never);

    await expect(
      service.allLetters('user-1', { year: '2026' }),
    ).resolves.toEqual([
      {
        id: 'r1',
        moodType: MoodType.tired,
        moodLabel: '疲惫',
        excerpt: '今天加班到很晚',
        checkInDate: '2026-10-12',
        createdAt: record.createdAt,
      },
    ]);
    // 不按关键词筛，但年/月/情绪照筛：这是「全部来信」和「这个关键词的来信」唯一的分歧点
    expect(prisma.checkInRecord.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', checkInDate: { startsWith: '2026-' } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('keeps the keyword filter on the per-node list', async () => {
    const prisma = {
      graphNode: { findUnique: jest.fn().mockResolvedValue({ id: 'n1' }) },
      checkInRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new MailboxService(prisma as never);

    await service.letters('user-1', 'n1', { mood: MoodType.tired });

    expect(prisma.checkInRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          moodType: MoodType.tired,
          nodes: { some: { id: 'n1' } },
        },
      }),
    );
  });

  it('returns the same fields from both list routes', async () => {
    // 两条路由抽的是同一个私有 list()，字段漂了前端就得写两套渲染 —— 钉一下
    const prisma = {
      graphNode: { findUnique: jest.fn().mockResolvedValue({ id: 'n1' }) },
      checkInRecord: { findMany: jest.fn().mockResolvedValue([record]) },
    };
    const service = new MailboxService(prisma as never);

    const byNode = await service.letters('user-1', 'n1', {});
    const all = await service.allLetters('user-1', {});

    expect(Object.keys(byNode[0]).sort()).toEqual(Object.keys(all[0]).sort());
    expect(byNode).toEqual(all);
  });
});
