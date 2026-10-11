import { MoodType } from '@prisma/client';
import { MailboxService } from './mailbox.service';

describe('MailboxService.graph', () => {
  it('builds nodes and edges only from the filtered check-ins', async () => {
    const records = [
      {
        id: 'r1',
        nodes: [
          { id: 'n1', keyword: '考试' },
          { id: 'n2', keyword: '朋友' },
        ],
      },
    ];
    const prisma = {
      checkInRecord: { findMany: jest.fn().mockResolvedValue(records) },
    };
    const service = new MailboxService(prisma as never);
    await expect(
      service.graph('user-1', {
        year: '2026',
        month: '10',
        mood: MoodType.anxious,
      }),
    ).resolves.toEqual({
      nodes: [
        { id: 'n1', keyword: '考试' },
        { id: 'n2', keyword: '朋友' },
      ],
      edges: [{ source: 'n1', target: 'n2' }],
    });
    expect(prisma.checkInRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          moodType: MoodType.anxious,
          checkInDate: { startsWith: '2026-10' },
        },
      }),
    );
  });
});
