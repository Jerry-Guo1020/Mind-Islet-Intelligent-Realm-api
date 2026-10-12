import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { WechatClient } from './wechat.client';

interface MemoryUser {
  id: string;
  openid: string;
  wechatOpenidHash: string | null;
  nickname: string;
  avatar: string;
  createdAt: Date;
  spiritOnboarded?: boolean;
}

interface MemorySession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt?: Date | null;
}

function memoryPrisma() {
  const users: MemoryUser[] = [];
  const sessions: MemorySession[] = [];
  const sessionUpdates: Partial<MemorySession>[] = [];
  let seq = 0;
  return {
    users,
    sessions,
    sessionUpdates,
    client: {
      user: {
        findUnique: ({ where }: { where: { wechatOpenidHash: string } }) =>
          users.find(
            (user) => user.wechatOpenidHash === where.wechatOpenidHash,
          ) ?? null,
        create: ({ data }: { data: Omit<MemoryUser, 'id' | 'createdAt'> }) => {
          const user = {
            ...data,
            id: `user-${++seq}`,
            createdAt: new Date(),
            spiritOnboarded: false,
          };
          users.push(user);
          return user;
        },
        update: ({
          where,
          data,
        }: {
          where: { id: string };
          data: { lastLoginAt: Date };
        }) => {
          const user = users.find((item) => item.id === where.id);
          if (!user) return null;
          Object.assign(user, data);
          return user;
        },
      },
      authSession: {
        create: ({ data }: { data: MemorySession }) => {
          sessions.push(data);
          return data;
        },
        findUnique: ({
          where,
        }: {
          where: { tokenHash: string };
          include?: { user: boolean };
        }) => {
          const session = sessions.find(
            (item) => item.tokenHash === where.tokenHash,
          );
          if (!session) return null;
          return {
            ...session,
            user: users.find((user) => user.id === session.userId),
          };
        },
        update: ({
          where,
          data,
        }: {
          where: { tokenHash: string };
          data: Partial<MemorySession>;
        }) => {
          const session = sessions.find(
            (item) => item.tokenHash === where.tokenHash,
          );
          if (!session) return null;
          sessionUpdates.push({ ...data, tokenHash: where.tokenHash });
          Object.assign(session, data);
          return session;
        },
      },
    },
  };
}

describe('AuthService', () => {
  const originalEnv = {
    AUTH_TOKEN_SECRET: process.env.AUTH_TOKEN_SECRET,
    WECHAT_HASH_SECRET: process.env.WECHAT_HASH_SECRET,
    AUTH_SESSION_TTL_SECONDS: process.env.AUTH_SESSION_TTL_SECONDS,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(() => {
    process.env.AUTH_TOKEN_SECRET = 'token-secret';
    process.env.WECHAT_HASH_SECRET = 'wechat-secret';
    process.env.AUTH_SESSION_TTL_SECONDS = '2592000';
  });

  function setup(codeToSession: WechatClient['codeToSession']) {
    const db = memoryPrisma();
    const wechat: WechatClient = { codeToSession };
    const service = new AuthService(db.client as never, wechat);
    return { db, service };
  }

  it('rejects a login without code', async () => {
    const { service } = setup(jest.fn());
    await expect(service.login({ provider: 'weixin' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unsupported provider', async () => {
    const { service } = setup(jest.fn());
    await expect(
      service.login({ provider: 'qq', code: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('turns a WeChat failure into an unauthorized response and stores nothing', async () => {
    const { db, service } = setup(() =>
      Promise.reject(new UnauthorizedException('WeChat login failed')),
    );
    await expect(
      service.login({ provider: 'weixin', code: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.users).toHaveLength(0);
  });

  it('registers a new user without returning the WeChat openid', async () => {
    const { db, service } = setup(() =>
      Promise.resolve({ openid: 'wx-openid-1' }),
    );
    const result = await service.login({
      provider: 'weixin',
      code: 'good',
      userInfo: { nickName: '真实昵称' },
    });

    expect(result.isNewUser).toBe(true);
    expect(result.token.startsWith('tv_session.')).toBe(true);
    expect(result.userInfo.nickname).toMatch(/^用户\d{6}$/);
    expect(result.userInfo.avatar).toContain('api.dicebear.com');
    expect(JSON.stringify(result)).not.toContain('wx-openid-1');
    expect(db.users[0].openid.startsWith('tv_wechat_')).toBe(true);
    expect(db.users[0].wechatOpenidHash).not.toContain('wx-openid-1');
    expect(db.sessions).toHaveLength(1);
  });

  it('reuses the same user when the WeChat openid hashes to an existing row', async () => {
    const wechat = () => Promise.resolve({ openid: 'wx-openid-1' });
    const { db, service } = setup(wechat);
    const first = await service.login({ provider: 'weixin', code: 'good' });
    const second = await service.login({ provider: 'wechat', code: 'again' });

    expect(second.isNewUser).toBe(false);
    expect(second.userInfo.id).toBe(first.userInfo.id);
    expect(db.users).toHaveLength(1);
    expect(db.sessions).toHaveLength(2);
  });

  it('reports WeChat outage without creating a user', async () => {
    const { db, service } = setup(() =>
      Promise.reject(
        new ServiceUnavailableException(
          'WeChat login is temporarily unavailable',
        ),
      ),
    );
    await expect(service.login({ code: 'good' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(db.users).toHaveLength(0);
  });

  it('resolves a live session and rejects it after logout', async () => {
    const { service } = setup(() => Promise.resolve({ openid: 'wx-openid-1' }));
    const result = await service.login({ provider: 'weixin', code: 'good' });
    const user = await service.authenticate(`Bearer ${result.token}`);
    expect(user.id).toBe(result.userInfo.id);

    await service.logout(`Bearer ${result.token}`);
    await expect(
      service.authenticate(`Bearer ${result.token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reports whether the spirit introduction was already seen', async () => {
    const { db, service } = setup(() =>
      Promise.resolve({ openid: 'wx-openid-1' }),
    );
    const first = await service.login({ provider: 'weixin', code: 'good' });
    expect(first.userInfo.spiritOnboarded).toBe(false);

    db.users[0].spiritOnboarded = true;
    const second = await service.login({ provider: 'weixin', code: 'good' });
    expect(second.userInfo.spiritOnboarded).toBe(true);
  });

  it('does not rewrite lastUsedAt when the session was used a minute ago', async () => {
    const { db, service } = setup(() =>
      Promise.resolve({ openid: 'wx-openid-1' }),
    );
    const result = await service.login({ provider: 'weixin', code: 'good' });
    db.sessions[0].lastUsedAt = new Date(Date.now() - 60_000);

    await service.authenticate(`Bearer ${result.token}`);

    expect(db.sessionUpdates).toHaveLength(0);
  });

  it('records lastUsedAt when the session has never been used', async () => {
    const { db, service } = setup(() =>
      Promise.resolve({ openid: 'wx-openid-1' }),
    );
    const result = await service.login({ provider: 'weixin', code: 'good' });

    await service.authenticate(`Bearer ${result.token}`);

    expect(db.sessionUpdates).toHaveLength(1);
    expect(db.sessionUpdates[0].lastUsedAt).toBeInstanceOf(Date);
  });

  it('refreshes lastUsedAt once the session sat idle past five minutes', async () => {
    const { db, service } = setup(() =>
      Promise.resolve({ openid: 'wx-openid-1' }),
    );
    const result = await service.login({ provider: 'weixin', code: 'good' });
    db.sessions[0].lastUsedAt = new Date(Date.now() - 6 * 60_000);

    await service.authenticate(`Bearer ${result.token}`);

    expect(db.sessionUpdates).toHaveLength(1);
  });
});
