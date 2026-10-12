import { AssetType, MoodType } from '@prisma/client';
import { ASSET_BY_MOOD, ASSET_META, metaForMood } from './assetMeta';
import { MOOD_LABELS, moodLabel } from './mood';

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
