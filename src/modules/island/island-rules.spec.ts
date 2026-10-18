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
});
