import { AssetType, MoodType } from '@prisma/client';
import { ASSET_BY_MOOD, ASSET_META, metaForMood } from './assetMeta';
import { MOOD_LABELS, MOOD_ORDER, moodLabel } from './mood';

describe('moodLabel', () => {
  it('names every mood in Chinese', () => {
    expect(Object.values(MoodType).map(moodLabel)).toEqual([
      '狂喜',
      '平静',
      '疲惫',
      '焦虑',
      '悲伤',
    ]);
    expect(Object.keys(MOOD_LABELS)).toHaveLength(5);
  });

  it('orders every mood exactly once, in the order the tree uses', () => {
    // 成长树按这个顺序把 5 个枝头摆到写死的槽位上。少一个、多一个、或者顺序变了，
    // 树上的枝头就会换位置 —— 而前后端两边都不会报错，只有眼睛看得出来。
    expect(MOOD_ORDER).toHaveLength(5);
    expect(new Set(MOOD_ORDER).size).toBe(MOOD_ORDER.length);
    expect([...MOOD_ORDER].sort()).toEqual([...Object.keys(MOOD_LABELS)].sort());
    expect(MOOD_ORDER).toEqual([
      'ecstatic',
      'calm',
      'tired',
      'anxious',
      'sad',
    ]);
    // 前端的 constants/mood.js 的 MOOD_TREE_ORDER 是同一串（改一处就得改另一处）
  });
});

describe('assetMeta', () => {
  it('maps every mood to exactly one asset', () => {
    const mapped = Object.values(MoodType).map((mood) => ASSET_BY_MOOD[mood]);
    expect(mapped).toEqual([
      AssetType.flower,
      AssetType.grass,
      AssetType.house,
      AssetType.tree,
      AssetType.house_blue,
    ]);
  });

  it('describes every asset with a name, a type label and a relation', () => {
    for (const assetType of Object.values(AssetType)) {
      const meta = ASSET_META[assetType];
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.typeLabel.length).toBeGreaterThan(0);
      expect(meta.relation.length).toBeGreaterThan(0);
    }
  });

  it('gives anxious and sad different assets and different wording', () => {
    const anxious = metaForMood(MoodType.anxious);
    const sad = metaForMood(MoodType.sad);
    expect(anxious.assetType).not.toBe(sad.assetType);
    expect(anxious.relation).not.toBe(sad.relation);
  });

  it('keeps asset names unique per mood', () => {
    const names = Object.values(MoodType).map((mood) => metaForMood(mood).name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('returns the asset type together with the mood wording', () => {
    expect(metaForMood(MoodType.calm)).toEqual({
      assetType: AssetType.grass,
      ...ASSET_META[AssetType.grass],
    });
  });
});
