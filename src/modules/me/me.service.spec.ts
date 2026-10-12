import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { MeService } from './me.service';

function prismaStub(overrides: { spiritOnboarded?: boolean } = {}) {
  const user = {
    id: 'user-1',
    nickname: '旧昵称',
    avatar: 'https://cdn.example.com/old.png',
    createdAt: new Date('2026-10-01T00:30:00+08:00'),
    lastLoginAt: null,
    spiritOnboarded: overrides.spiritOnboarded ?? false,
    reminderEnabled: false,
    reminderTime: null as string | null,
  };
  const updates: Record<string, unknown>[] = [];
  const client = {
    user: {
      findUnique: jest.fn(
        ({
          where,
          select,
        }: {
          where: { id: string };
          select?: Record<string, boolean>;
        }) => {
          if (where.id !== user.id) return null;
          if (!select) return user;
          const picked: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            picked[key] = (user as unknown as Record<string, unknown>)[key];
          }
          return picked;
        },
      ),
      update: jest.fn(
        ({
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          updates.push(data);
          Object.assign(user, data);
          return user;
        },
      ),
    },
    checkInRecord: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new MeService(
    client as unknown as PrismaService,
    new ProgressService(client as unknown as PrismaService),
  );
  return { user, updates, service };
}

describe('MeService.overview', () => {
  it('reports the profile together with the island counters', async () => {
    const { service } = prismaStub();
    const overview = await service.overview(
      'user-1',
      new Date('2026-10-12T10:00:00+08:00'),
    );

    expect(overview).toEqual({
      id: 'user-1',
      nickname: '旧昵称',
      avatar: 'https://cdn.example.com/old.png',
      createdAt: new Date('2026-10-01T00:30:00+08:00'),
      spiritOnboarded: false,
      daysOnIsland: 12,
      totalCheckIns: 0,
      streak: 0,
      checkedInToday: false,
      growthStage: 'barren',
      growthLabel: '荒岛',
    });
  });

  it('rejects an unknown user', async () => {
    const { service } = prismaStub();
    await expect(service.overview('someone-else')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('MeService.updateProfile', () => {
  it('changes the nickname without touching the avatar', async () => {
    const { user, updates, service } = prismaStub();
    await service.updateProfile('user-1', { nickname: '  新昵称  ' });

    expect(updates).toEqual([{ nickname: '新昵称' }]);
    expect(user.avatar).toBe('https://cdn.example.com/old.png');
  });

  it('changes the avatar without touching the nickname', async () => {
    const { updates, service } = prismaStub();
    await service.updateProfile('user-1', {
      avatar: 'https://cdn.example.com/new.png',
    });

    expect(updates).toEqual([{ avatar: 'https://cdn.example.com/new.png' }]);
  });

  it('rejects a request that carries no field at all', async () => {
    const { updates, service } = prismaStub();
    await expect(service.updateProfile('user-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updates).toHaveLength(0);
  });

  it('rejects a nickname over twelve characters', async () => {
    const { updates, service } = prismaStub();
    await expect(
      service.updateProfile('user-1', {
        nickname: '一二三四五六七八九十十一二',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updates).toHaveLength(0);
  });

  it('rejects a non https avatar', async () => {
    const { service } = prismaStub();
    await expect(
      service.updateProfile('user-1', {
        avatar: 'http://cdn.example.com/a.png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MeService.settings', () => {
  it('starts with the reminder off and no time', async () => {
    const { service } = prismaStub();
    expect(await service.settings('user-1')).toEqual({
      reminderEnabled: false,
      reminderTime: null,
    });
  });

  it('fills in the default time when the reminder is turned on without one', async () => {
    const { updates, service } = prismaStub();
    const settings = await service.updateSettings('user-1', {
      reminderEnabled: true,
    });

    expect(updates).toEqual([{ reminderEnabled: true, reminderTime: '20:00' }]);
    expect(settings).toEqual({
      reminderEnabled: true,
      reminderTime: '20:00',
    });
  });

  it('keeps an existing time when the reminder is turned on again', async () => {
    const { updates, service } = prismaStub();
    await service.updateSettings('user-1', { reminderTime: '07:30' });
    updates.length = 0;

    await service.updateSettings('user-1', { reminderEnabled: true });

    expect(updates).toEqual([{ reminderEnabled: true, reminderTime: '07:30' }]);
  });

  it('stores a time on its own', async () => {
    const { service } = prismaStub();
    expect(
      await service.updateSettings('user-1', { reminderTime: '09:05' }),
    ).toEqual({ reminderEnabled: false, reminderTime: '09:05' });
  });

  it('rejects an out of range time', async () => {
    const { updates, service } = prismaStub();
    await expect(
      service.updateSettings('user-1', { reminderTime: '25:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updates).toHaveLength(0);
  });

  it('rejects a non boolean switch', async () => {
    const { service } = prismaStub();
    await expect(
      service.updateSettings('user-1', { reminderEnabled: 'yes' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a request that carries no field at all', async () => {
    const { service } = prismaStub();
    await expect(service.updateSettings('user-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reports settings for an unknown user', async () => {
    const { service } = prismaStub();
    await expect(service.settings('someone-else')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('MeService.markSpiritOnboarded', () => {
  it('marks the first visit and stays quiet on the second', async () => {
    const { user, updates, service } = prismaStub();

    expect(await service.markSpiritOnboarded('user-1')).toEqual({
      spiritOnboarded: true,
    });
    expect(await service.markSpiritOnboarded('user-1')).toEqual({
      spiritOnboarded: true,
    });

    expect(updates).toEqual([{ spiritOnboarded: true }]);
    expect(user.spiritOnboarded).toBe(true);
  });

  it('rejects an unknown user', async () => {
    const { updates, service } = prismaStub();
    await expect(
      service.markSpiritOnboarded('someone-else'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updates).toHaveLength(0);
  });
});
