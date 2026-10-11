import {
  createPublicOpenid,
  createSessionToken,
  dicebearAvatar,
  hmacHex,
  randomNickname,
  shanghaiDate,
} from './crypto.util';

describe('crypto util', () => {
  it('hashes the same value to the same hex and never returns the source', () => {
    const first = hmacHex('secret', 'openid-1');
    expect(hmacHex('secret', 'openid-1')).toBe(first);
    expect(first).not.toContain('openid-1');
    expect(hmacHex('other', 'openid-1')).not.toBe(first);
  });

  it('builds opaque session tokens and public openids', () => {
    expect(createSessionToken().startsWith('tv_session.')).toBe(true);
    expect(createPublicOpenid().startsWith('tv_wechat_')).toBe(true);
    expect(createSessionToken()).not.toBe(createSessionToken());
  });

  it('builds a six-digit nickname and a dicebear url from it', () => {
    const nickname = randomNickname();
    expect(nickname).toMatch(/^用户\d{6}$/);
    expect(dicebearAvatar('用户123456')).toBe(
      'https://api.dicebear.com/7.x/pixel-art/png?seed=%E7%94%A8%E6%88%B7123456',
    );
  });

  it('formats the Shanghai calendar date', () => {
    expect(shanghaiDate(new Date('2026-10-09T16:30:00.000Z'))).toBe(
      '2026-10-10',
    );
    expect(shanghaiDate(new Date('2026-10-09T15:30:00.000Z'))).toBe(
      '2026-10-09',
    );
  });
});
