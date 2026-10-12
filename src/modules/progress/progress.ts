import { shanghaiDate } from '../../common/crypto.util';

export type GrowthStage = 'barren' | 'sprout' | 'oasis';

/** 累计打卡到几次，岛屿进入下一个状态。 */
export const GROWTH_THRESHOLDS = { sprout: 1, oasis: 7 } as const;

export function growthStage(totalCheckIns: number): GrowthStage {
  if (totalCheckIns >= GROWTH_THRESHOLDS.oasis) return 'oasis';
  if (totalCheckIns >= GROWTH_THRESHOLDS.sprout) return 'sprout';
  return 'barren';
}

export function growthLabel(stage: GrowthStage): string {
  return { barren: '荒岛', sprout: '萌芽', oasis: '绿洲' }[stage];
}

/** 在 y-m-d 上加减天数。按 UTC 正午之外做整数运算，避免时区漂移。 */
function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(
    Date.UTC(year, month - 1, date) + delta * 86_400_000,
  );
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 入岛天数。注册当天算第 1 天。 */
export function daysOnIsland(createdAt: Date, now = new Date()): number {
  const start = Date.parse(`${shanghaiDate(createdAt)}T00:00:00Z`);
  const end = Date.parse(`${shanghaiDate(now)}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

/**
 * 连续打卡天数。今天打过卡就从今天往前数，今天还没打卡就从昨天往前数。
 * 中间断一天即停止。
 */
export function currentStreak(checkInDates: string[], today: string): number {
  const days = new Set(checkInDates);
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}
