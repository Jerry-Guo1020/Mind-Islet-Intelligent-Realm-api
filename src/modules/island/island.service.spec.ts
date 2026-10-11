import { MoodType } from '@prisma/client';
import { IslandService } from './island.service';

describe('IslandService.weather', () => {
  const now = new Date('2026-10-09T16:30:00.000Z');

  it('returns calm and sunny when the user has not checked in today', async () => {
    const prisma = {
      checkInRecord: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new IslandService(prisma as never);
    await expect(service.weather('user-1', now)).resolves.toEqual({
      moodType: MoodType.calm,
      weather: 'sunny',
      checkedIn: false,
    });
    expect(prisma.checkInRecord.findUnique).toHaveBeenCalledWith({
      where: {
        userId_checkInDate: { userId: 'user-1', checkInDate: '2026-10-10' },
      },
    });
  });

  it('returns rain for anxious and sad', async () => {
    const prisma = {
      checkInRecord: {
        findUnique: jest.fn().mockResolvedValue({ moodType: MoodType.sad }),
      },
    };
    const service = new IslandService(prisma as never);
    await expect(service.weather('user-1', now)).resolves.toMatchObject({
      moodType: MoodType.sad,
      weather: 'rain',
      checkedIn: true,
    });
  });
});
