import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createPublicOpenid,
  createSessionToken,
  dicebearAvatar,
  hmacHex,
  randomNickname,
} from '../../common/crypto.util';
import type { WechatClient } from './wechat.client';

export const WECHAT_CLIENT = 'WECHAT_CLIENT';

export interface LoginInput {
  provider?: string;
  code?: string;
  userInfo?: { nickName?: string; avatarUrl?: string };
}

export interface AuthEnv {
  AUTH_TOKEN_SECRET: string;
  WECHAT_HASH_SECRET: string;
  AUTH_SESSION_TTL_SECONDS: string;
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WECHAT_CLIENT) private readonly wechat: WechatClient,
  ) {}

  private get env(): AuthEnv {
    return readAuthEnv();
  }

  async login(input: LoginInput = {}) {
    const provider = input.provider?.trim().toLowerCase();
    if (provider && provider !== 'weixin' && provider !== 'wechat') {
      throw new BadRequestException('Unsupported login provider');
    }
    const code = input.code?.trim();
    if (!code) {
      throw new BadRequestException('code is required');
    }

    const session = await this.wechat.codeToSession(code);
    const wechatOpenidHash = hmacHex(
      this.env.WECHAT_HASH_SECRET,
      session.openid,
    );
    const existing = await this.prisma.user.findUnique({
      where: { wechatOpenidHash },
    });
    const nickname = existing?.nickname ?? randomNickname();
    const avatar = existing?.avatar ?? dicebearAvatar(nickname);
    const user =
      existing ??
      (await this.prisma.user.create({
        data: {
          openid: createPublicOpenid(),
          wechatOpenidHash,
          nickname,
          avatar,
        },
      }));
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = createSessionToken();
    const ttl = Number(this.env.AUTH_SESSION_TTL_SECONDS);
    const seconds = Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_SECONDS;
    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: hmacHex(this.env.AUTH_TOKEN_SECRET, token),
        expiresAt: new Date(Date.now() + seconds * 1000),
      },
    });

    return {
      token,
      isNewUser: !existing,
      userInfo: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        createdAt: user.createdAt,
        spiritOnboarded: user.spiritOnboarded,
      },
    };
  }

  async authenticate(authorization?: string) {
    const token = extractBearer(authorization);
    if (!token.startsWith('tv_session.')) {
      throw new UnauthorizedException('User token is no longer valid');
    }
    const tokenHash = hmacHex(this.env.AUTH_TOKEN_SECRET, token);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('User token is no longer valid');
    }
    if (shouldRecordUsage(session.lastUsedAt)) {
      await this.prisma.authSession.update({
        where: { tokenHash },
        data: { lastUsedAt: new Date() },
      });
    }
    return session.user;
  }

  async logout(authorization?: string) {
    const token = extractBearer(authorization);
    if (!token.startsWith('tv_session.')) {
      throw new UnauthorizedException('User token is no longer valid');
    }
    const tokenHash = hmacHex(this.env.AUTH_TOKEN_SECRET, token);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('User token is no longer valid');
    }
    await this.prisma.authSession.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true };
  }
}

/** 距上次记录不足 5 分钟就不再写库，避免每次请求都更新会话行。 */
export const SESSION_USAGE_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRecordUsage(
  lastUsedAt: Date | null | undefined,
): boolean {
  if (!lastUsedAt) return true;
  return Date.now() - lastUsedAt.getTime() >= SESSION_USAGE_INTERVAL_MS;
}

export function extractBearer(authorization?: string): string {
  if (!authorization) {
    throw new UnauthorizedException('Missing authorization token');
  }
  return authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : authorization.trim();
}

export function readAuthEnv(): AuthEnv {
  return {
    AUTH_TOKEN_SECRET: process.env.AUTH_TOKEN_SECRET || 'change-me-token',
    WECHAT_HASH_SECRET: process.env.WECHAT_HASH_SECRET || 'change-me-wechat',
    AUTH_SESSION_TTL_SECONDS: process.env.AUTH_SESSION_TTL_SECONDS || '2592000',
  };
}
