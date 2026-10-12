import { BadRequestException } from '@nestjs/common';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const YEAR_PATTERN = /^\d{4}$/;

/** 昵称不允许换行、制表符这类控制字符。 */
function hasControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** 必填字符串：去空白、非空、不超长。 */
export function requireString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') throw new BadRequestException(`${field} 必填`);
  const trimmed = value.trim();
  if (!trimmed) throw new BadRequestException(`${field} 必填`);
  if (trimmed.length > maxLength) {
    throw new BadRequestException(`${field} 超过 ${maxLength} 字`);
  }
  return trimmed;
}

/** 昵称：1 至 12 字，不允许换行与控制字符。 */
export function parseNickname(value: unknown): string {
  const nickname = requireString(value, 'nickname', 12);
  if (hasControlChar(nickname)) {
    throw new BadRequestException('nickname 含有控制字符');
  }
  return nickname;
}

/** 头像：任意 https 地址，最长 512 字。 */
export function parseAvatarUrl(value: unknown): string {
  const url = requireString(value, 'avatar', 512);
  if (!url.startsWith('https://')) {
    throw new BadRequestException('avatar 必须是 https 地址');
  }
  return url;
}

/** 提醒时间：HH:mm，24 小时制。 */
export function parseReminderTime(value: unknown): string {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value.trim())) {
    throw new BadRequestException('reminderTime 需形如 HH:mm');
  }
  return value.trim();
}

export function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${field} 必须是布尔值`);
  }
  return value;
}

/** 分页条数：非法回退默认值，超过上限截断。 */
export function parseLimit(
  value: unknown,
  fallback: number,
  max: number,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

/** ISO 时间戳，空值视为未传。 */
export function parseIsoDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} 必须是 ISO 时间`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} 必须是 ISO 时间`);
  }
  return parsed;
}

/** 四位年份，空值视为未传。 */
export function parseYear(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !YEAR_PATTERN.test(value.trim())) {
    throw new BadRequestException('year 需为四位数字');
  }
  return value.trim();
}

/** 月份 1 至 12，返回两位补零形式。 */
export function parseMonth(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{1,2}$/.test(value.trim())) {
    throw new BadRequestException('month 需在 1 到 12 之间');
  }
  const month = Number(value.trim());
  if (month < 1 || month > 12) {
    throw new BadRequestException('month 需在 1 到 12 之间');
  }
  return String(month).padStart(2, '0');
}
