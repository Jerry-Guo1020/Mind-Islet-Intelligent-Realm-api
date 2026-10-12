import { BadRequestException } from '@nestjs/common';
import {
  parseAvatarUrl,
  parseBoolean,
  parseIsoDate,
  parseLimit,
  parseMonth,
  parseNickname,
  parseReminderTime,
  parseYear,
  requireString,
} from './validation';

describe('requireString', () => {
  it('trims the value', () => {
    expect(requireString('  hello  ', 'content', 20)).toBe('hello');
  });

  it('rejects a missing or blank value', () => {
    expect(() => requireString(undefined, 'content', 20)).toThrow(
      BadRequestException,
    );
    expect(() => requireString('   ', 'content', 20)).toThrow(
      BadRequestException,
    );
    expect(() => requireString(7, 'content', 20)).toThrow(BadRequestException);
  });

  it('rejects a value over the limit', () => {
    expect(() => requireString('abcdef', 'content', 5)).toThrow(
      BadRequestException,
    );
    expect(requireString('abcde', 'content', 5)).toBe('abcde');
  });
});

describe('parseNickname', () => {
  it('accepts a trimmed nickname of up to twelve characters', () => {
    expect(parseNickname('  小屿  ')).toBe('小屿');
    expect(parseNickname('一二三四五六七八九十十一')).toBe(
      '一二三四五六七八九十十一',
    );
  });

  it('rejects an empty nickname', () => {
    expect(() => parseNickname('   ')).toThrow(BadRequestException);
    expect(() => parseNickname(undefined)).toThrow(BadRequestException);
  });

  it('rejects a nickname over twelve characters', () => {
    expect(() => parseNickname('一二三四五六七八九十十一二')).toThrow(
      BadRequestException,
    );
  });

  it('rejects line breaks and control characters', () => {
    expect(() => parseNickname('小\n屿')).toThrow(BadRequestException);
    expect(() => parseNickname('小\t屿')).toThrow(BadRequestException);
  });
});

describe('parseAvatarUrl', () => {
  it('accepts an https url', () => {
    expect(parseAvatarUrl('https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  it('rejects a non-https url', () => {
    expect(() => parseAvatarUrl('http://cdn.example.com/a.png')).toThrow(
      BadRequestException,
    );
    expect(() => parseAvatarUrl('cdn.example.com/a.png')).toThrow(
      BadRequestException,
    );
    expect(() => parseAvatarUrl(undefined)).toThrow(BadRequestException);
  });

  it('rejects a url over 512 characters', () => {
    expect(() => parseAvatarUrl(`https://a.com/${'b'.repeat(600)}`)).toThrow(
      BadRequestException,
    );
  });
});

describe('parseReminderTime', () => {
  it('accepts a 24 hour clock value', () => {
    expect(parseReminderTime('00:00')).toBe('00:00');
    expect(parseReminderTime('23:59')).toBe('23:59');
    expect(parseReminderTime('20:00')).toBe('20:00');
  });

  it('rejects a non padded or out of range value', () => {
    expect(() => parseReminderTime('7:05')).toThrow(BadRequestException);
    expect(() => parseReminderTime('7:5')).toThrow(BadRequestException);
    expect(() => parseReminderTime('24:00')).toThrow(BadRequestException);
    expect(() => parseReminderTime('23:60')).toThrow(BadRequestException);
    expect(() => parseReminderTime(undefined)).toThrow(BadRequestException);
  });
});

describe('parseBoolean', () => {
  it('accepts real booleans only', () => {
    expect(parseBoolean(true, 'reminderEnabled')).toBe(true);
    expect(parseBoolean(false, 'reminderEnabled')).toBe(false);
  });

  it('rejects strings and numbers', () => {
    expect(() => parseBoolean('yes', 'reminderEnabled')).toThrow(
      BadRequestException,
    );
    expect(() => parseBoolean(1, 'reminderEnabled')).toThrow(
      BadRequestException,
    );
    expect(() => parseBoolean(undefined, 'reminderEnabled')).toThrow(
      BadRequestException,
    );
  });
});

describe('parseLimit', () => {
  it('falls back when the value is missing or unusable', () => {
    expect(parseLimit(undefined, 20, 50)).toBe(20);
    expect(parseLimit('abc', 20, 50)).toBe(20);
    expect(parseLimit('0', 20, 50)).toBe(20);
    expect(parseLimit('-3', 20, 50)).toBe(20);
  });

  it('reads a number and caps it at the maximum', () => {
    expect(parseLimit('10', 20, 50)).toBe(10);
    expect(parseLimit('999', 20, 50)).toBe(50);
  });
});

describe('parseIsoDate', () => {
  it('accepts an ISO timestamp', () => {
    expect(parseIsoDate('2026-10-12T10:00:00.000Z', 'before')).toEqual(
      new Date('2026-10-12T10:00:00.000Z'),
    );
  });

  it('treats an empty value as absent', () => {
    expect(parseIsoDate(undefined, 'before')).toBeUndefined();
    expect(parseIsoDate('', 'before')).toBeUndefined();
  });

  it('rejects nonsense', () => {
    expect(() => parseIsoDate('yesterday', 'before')).toThrow(
      BadRequestException,
    );
    expect(() => parseIsoDate(123, 'before')).toThrow(BadRequestException);
  });
});

describe('parseYear and parseMonth', () => {
  it('accepts a four digit year and a valid month', () => {
    expect(parseYear('2026')).toBe('2026');
    expect(parseMonth('1')).toBe('01');
    expect(parseMonth('12')).toBe('12');
  });

  it('treats empty values as absent', () => {
    expect(parseYear(undefined)).toBeUndefined();
    expect(parseMonth('')).toBeUndefined();
  });

  it('rejects an out of shape year or month', () => {
    expect(() => parseYear('26')).toThrow(BadRequestException);
    expect(() => parseYear('abcd')).toThrow(BadRequestException);
    expect(() => parseMonth('0')).toThrow(BadRequestException);
    expect(() => parseMonth('13')).toThrow(BadRequestException);
    expect(() => parseMonth('abc')).toThrow(BadRequestException);
  });
});
