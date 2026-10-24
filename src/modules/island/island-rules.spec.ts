import {
  emptyIsland,
  offsetPoints,
  redeemItem,
  settleCheckIn,
  switchSeason,
} from './island-rules';

describe('island rules', () => {
  it('offsets the smaller balance to zero', () => {
    expect(offsetPoints(8, 20)).toEqual({
      happyPoints: 0,
      disappointPoints: 12,
    });
  });

  it('grants the tree once and then only points', () => {
    const first = settleCheckIn(emptyIsland(), 'ecstatic', '2026-10-01');
    expect(first.grantedTree).toBe(true);
    expect(first.state.happyPoints).toBe(15);
    const second = settleCheckIn(first.state, 'calm', '2026-10-02');
    expect(second.grantedTree).toBe(false);
    expect(second.state.placements).toHaveLength(1);
  });

  it('does not let the client skip an incomplete season', () => {
    const state = { ...emptyIsland(), consecutiveCheckInDays: 1 };
    expect(() => switchSeason(state, { demoSkipDays: true })).toThrow(
      'season_incomplete',
    );
  });

  it('accepts items owned in an earlier season, so the spring tree can finish later seasons', () => {
    const state = {
      ...emptyIsland(),
      season: 'summer',
      consecutiveCheckInDays: 30,
      placements: [
        { season: 'spring', itemId: 'tree', source: 'first_checkin' },
        { season: 'spring', itemId: 'house', source: 'redeem' },
        { season: 'spring', itemId: 'deluxe_house', source: 'redeem' },
      ],
    };
    expect(switchSeason(state).state.season).toBe('autumn');
    expect(() =>
      switchSeason({ ...state, placements: state.placements.slice(0, 1) }),
    ).toThrow('season_incomplete');
  });

  it('refuses to redeem without enough happy points', () => {
    expect(() => redeemItem(emptyIsland(), 'house')).toThrow(
      'insufficient_points',
    );
    expect(() => redeemItem(emptyIsland(), 'fence')).toThrow('not_redeemable');
    expect(() => redeemItem(emptyIsland(), 'special_tree')).toThrow(
      'unknown_item',
    );
  });

  it('books a pre-purchase into the season that was asked for', () => {
    // 买「夏天 · 小木屋」时夏天已经解锁（当前季就是夏天）：记到夏天头上，季节本身不动。
    const state = { ...emptyIsland(), season: 'summer', happyPoints: 100 };
    const next = redeemItem(state, 'house', 'summer').state;
    expect(next.season).toBe('summer');
    expect(next.happyPoints).toBe(70);
    expect(next.placements).toEqual([
      { season: 'summer', itemId: 'house', source: 'redeem' },
    ]);
  });

  it('refuses to sell into a season that is still locked', () => {
    // 2026-10-24 用户否掉了预购：春天买不了夏天/秋天/冬天的东西，接口也不收这种请求。
    const state = { ...emptyIsland(), happyPoints: 100 };
    expect(() => redeemItem(state, 'house', 'summer')).toThrow('season_locked');
    expect(() => redeemItem(state, 'deluxe_house', 'winter')).toThrow(
      'season_locked',
    );
    // 当前季节自己还是能买
    expect(redeemItem(state, 'house', 'spring').state.happyPoints).toBe(70);
  });

  it('falls back to the current season when no season is given', () => {
    const state = { ...emptyIsland(), season: 'autumn', happyPoints: 50 };
    const next = redeemItem(state, 'deluxe_house').state;
    expect(next.placements).toEqual([
      { season: 'autumn', itemId: 'deluxe_house', source: 'redeem' },
    ]);
    expect(next.happyPoints).toBe(10);
  });

  it('treats a dirty season value as spring instead of locking everything', () => {
    // 脏数据回落，和前端 unlockedSeasons 的 Math.max(0, …) 同一个口径：
    // 回落错了就变成「哪个季节都买不了」。
    const state = { ...emptyIsland(), season: 'monsoon', happyPoints: 100 };
    expect(redeemItem(state, 'house', 'spring').state.happyPoints).toBe(70);
    expect(() => redeemItem(state, 'house', 'summer')).toThrow('season_locked');
  });

  it('rejects a season that is not one of the four', () => {
    expect(() =>
      redeemItem({ ...emptyIsland(), happyPoints: 100 }, 'house', 'monsoon'),
    ).toThrow('unknown_season');
  });

  it('charges for an item only once, whatever season it was bought in', () => {
    // 前端说「拥有一次四季通用」，后端就不能换个季节再收一次钱。
    // 要测这条得让目标季节已经解锁（当前季 = 冬天），否则先被 season_locked 拦住。
    const owned = {
      ...emptyIsland(),
      season: 'winter',
      happyPoints: 100,
      placements: [{ season: 'summer', itemId: 'house', source: 'redeem' }],
    };
    expect(() => redeemItem(owned, 'house', 'spring')).toThrow('already_owned');
    expect(() => redeemItem(owned, 'house')).toThrow('already_owned');
  });
});
