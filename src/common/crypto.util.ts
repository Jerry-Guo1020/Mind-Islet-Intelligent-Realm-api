import { createHmac, randomBytes, randomInt } from 'crypto';

export function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function createSessionToken(): string {
  return `tv_session.${randomBytes(32).toString('base64url')}`;
}

export function createPublicOpenid(): string {
  return `tv_wechat_${randomBytes(14).toString('base64url')}`;
}

export function randomNickname(): string {
  return `用户${randomInt(100000, 1000000)}`;
}

export function dicebearAvatar(nickname: string): string {
  return `https://api.dicebear.com/7.x/pixel-art/png?seed=${encodeURIComponent(nickname)}`;
}

/** 上海自然日，格式 YYYY-MM-DD。打卡是否重复按这一天判断。 */
export function shanghaiDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
