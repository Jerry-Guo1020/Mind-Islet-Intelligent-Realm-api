import { AssetType, MoodType } from '@prisma/client';

/**
 * 情绪决定岛屿长出什么。同一份映射不能再写在别处，
 * 否则打卡发放的资产和岛屿展示的名称会走偏。
 */
export const ASSET_BY_MOOD: Record<MoodType, AssetType> = {
  ecstatic: AssetType.flower,
  calm: AssetType.grass,
  tired: AssetType.house,
  anxious: AssetType.tree,
  sad: AssetType.house_blue,
};

export interface AssetMeta {
  /** 展示用中文名。 */
  name: string;
  /** 植物或房屋。 */
  typeLabel: string;
  /** 这件资产与本次情绪的关联说明。 */
  relation: string;
}

export const ASSET_META: Record<AssetType, AssetMeta> = {
  flower: {
    name: '向阳花',
    typeLabel: '植物',
    relation: '狂喜的时候，岛上会开出一朵向阳花。',
  },
  grass: {
    name: '静草',
    typeLabel: '植物',
    relation: '平静的时候，岛上会安静地长出一丛静草。',
  },
  tree: {
    name: '雨树',
    typeLabel: '植物',
    relation: '焦虑的时候，岛上会种下一棵陪你听雨的树。',
  },
  house: {
    name: '暖屋',
    typeLabel: '房屋',
    relation: '疲惫的时候，岛上会亮起一间暖屋让你歇一歇。',
  },
  house_blue: {
    name: '蓝色小屋',
    typeLabel: '房屋',
    relation: '悲伤的时候，岛上会多一间蓝色小屋，替你收好这一天。',
  },
};

export function metaForMood(
  mood: MoodType,
): { assetType: AssetType } & AssetMeta {
  const assetType = ASSET_BY_MOOD[mood];
  return { assetType, ...ASSET_META[assetType] };
}
