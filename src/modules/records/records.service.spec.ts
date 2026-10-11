import { ConflictException } from '@nestjs/common';
import { MoodType } from '@prisma/client';
import { RecordsService } from './records.service';

describe('RecordsService', () => {
  it('rejects a second check-in on the same Shanghai date', async () => {
    const prisma = {
      checkInRecord: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
      },
    };
    const encouragement = { write: jest.fn() };
    const service = new RecordsService(prisma as never, encouragement);

    await expect(
      service.create('user-1', {
        moodType: MoodType.calm,
        content: '今天考试',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(encouragement.write).not.toHaveBeenCalled();
  });
});
