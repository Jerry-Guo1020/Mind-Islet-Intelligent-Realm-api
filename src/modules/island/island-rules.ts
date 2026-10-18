/** 与前端 utils/island-rules.js 同一套结算。这里只做纯计算。 */

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export const UNLOCK_DAYS_THRESHOLD = 30;
export const REQUIRED_ITEMS = ['tree', 'house', 'deluxe_house'] as const;
export const SEASON_ITEMS = ['tree', 'fence', 'house', 'deluxe_house'] as const;

export const ITEM_PRICES: Record<string, number> = {
  tree: 0,
  fence: 20,
  house: 30,
  deluxe_house: 40,
};

const MOODS: Record<
  string,
  { happy: number; disappoint: number; weather: string }
> = {
  ecstatic: { happy: 15, disappoint: 0, weather: 'sunny' },
  calm: { happy: 0, disappoint: 0, weather: 'cloudy' },
  tired: { happy: 0, disappoint: 5, weather: 'rainy' },
  anxious: { happy: 0, disappoint: 10, weather: 'rainy' },
  sad: { happy: 0, disappoint: 15, weather: 'rainy' },
};

export interface Placement {
  season: string;
  itemId: string;
  source: string;
}

export interface IslandState {
  happyPoints: number;
  disappointPoints: number;
  totalCheckIns: number;
  consecutiveCheckInDays: number;
  lastCheckInDate: string | null;
  lastMood: string | null;
  season: string;
  placements: Placement[];
  specialReward: string | null;
}

export function emptyIsland(): IslandState {
  return {
    happyPoints: 0,
    disappointPoints: 0,
    totalCheckIns: 0,
    consecutiveCheckInDays: 0,
    lastCheckInDate: null,
    lastMood: null,
    season: 'spring',
    placements: [],
    specialReward: null,
  };
}

export function resolveSpecialReward(): null {
  return null;
}

export class IslandRuleError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function fail(reason: string): never {
  throw new IslandRuleError(reason);
}

export function offsetPoints(happyPoints: number, disappointPoints: number) {
  if (!Number.isInteger(happyPoints) || !Number.isInteger(disappointPoints))
    fail('invalid_points');
  if (happyPoints < 0 || disappointPoints < 0) fail('invalid_points');
  if (happyPoints === 0 || disappointPoints === 0)
    return { happyPoints, disappointPoints };
  if (happyPoints >= disappointPoints) {
    return { happyPoints: happyPoints - disappointPoints, disappointPoints: 0 };
  }
  return { happyPoints: 0, disappointPoints: disappointPoints - happyPoints };
}

function dayNumber(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function hasItem(state: IslandState, season: string, itemId: string) {
  return state.placements.some(
    (item) => item.season === season && item.itemId === itemId,
  );
}

/**
 * 拥有一次就四季通用：只要在任何一个季节拥有过，就算拥有。
 * 不这样做的话，树只在春天发过一次（redeemItem 也不让买），夏天往后永远凑不开换季条件。
 * 前端 utils/island-rules.js 的 ownsAnySeason() 是同一个判断。
 */
function ownsAnySeason(state: IslandState, itemId: string) {
  return state.placements.some((item) => item.itemId === itemId);
}

export function settleCheckIn(state: IslandState, mood: string, date: string) {
  const score = MOODS[mood];
  if (!score) fail('invalid_mood');
  if (state.lastCheckInDate === date) fail('already_checked_in');
  const gap = state.lastCheckInDate
    ? dayNumber(date) - dayNumber(state.lastCheckInDate)
    : null;
  if (gap !== null && gap < 1) fail('already_checked_in');

  const next: IslandState = {
    ...state,
    placements: state.placements.map((item) => ({ ...item })),
    totalCheckIns: state.totalCheckIns + 1,
    consecutiveCheckInDays: gap === 1 ? state.consecutiveCheckInDays + 1 : 1,
    lastCheckInDate: date,
    lastMood: mood,
  };
  let grantedTree = false;
  if (state.totalCheckIns === 0) {
    next.placements.push({
      season: next.season,
      itemId: 'tree',
      source: 'first_checkin',
    });
    grantedTree = true;
  }
  const points = offsetPoints(
    next.happyPoints + score.happy,
    next.disappointPoints + score.disappoint,
  );
  next.happyPoints = points.happyPoints;
  next.disappointPoints = points.disappointPoints;
  next.specialReward = resolveSpecialReward();
  return {
    state: next,
    grantedTree,
    delta: { happy: score.happy, disappoint: score.disappoint },
  };
}

export function redeemItem(state: IslandState, itemId: string) {
  if (!SEASON_ITEMS.includes(itemId as (typeof SEASON_ITEMS)[number]))
    fail('unknown_item');
  if (itemId === 'tree' || itemId === 'fence') fail('not_redeemable');
  if (hasItem(state, state.season, itemId)) fail('already_owned');
  const points = offsetPoints(state.happyPoints, state.disappointPoints);
  const price = ITEM_PRICES[itemId];
  if (points.happyPoints < price) fail('insufficient_points');
  return {
    state: {
      ...state,
      happyPoints: points.happyPoints - price,
      disappointPoints: points.disappointPoints,
      placements: [
        ...state.placements,
        { season: state.season, itemId, source: 'redeem' },
      ],
    },
  };
}

export function switchSeason(
  state: IslandState,
  options: { threshold?: number; demoSkipDays?: boolean } = {},
) {
  const threshold = options.threshold || UNLOCK_DAYS_THRESHOLD;
  const missing = REQUIRED_ITEMS.filter(
    (itemId) => !ownsAnySeason(state, itemId),
  );
  if (missing.length) fail('season_incomplete');
  if (!options.demoSkipDays && state.consecutiveCheckInDays < threshold)
    fail('days_not_enough');
  const index = SEASONS.indexOf(state.season as (typeof SEASONS)[number]);
  if (index < 0 || index === SEASONS.length - 1) fail('no_next_season');
  return { state: { ...state, season: SEASONS[index + 1] } };
}

export function weatherOf(mood: string | null) {
  if (!mood || !MOODS[mood]) return { file: 'sunny', label: '晴天' };
  const file = MOODS[mood].weather;
  const label = file === 'sunny' ? '晴天' : file === 'cloudy' ? '阴天' : '雨天';
  return { file, label };
}
