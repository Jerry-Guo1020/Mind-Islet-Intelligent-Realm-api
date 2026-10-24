import { MoodType } from '@prisma/client';
import {
  NO_CHECKIN_LINE,
  checkInKeywords,
  keywordText,
  todayCheckInLine,
} from './checkin-context';

const FULL = {
  moodType: MoodType.anxious,
  content: '今天加班到十点，回家躺着睡不着。',
  keywords: ['加班', '睡不着'],
  aiReply: '先陪自己站一会儿',
  weather: 'rain' as const,
};

describe('todayCheckInLine', () => {
  it('把今天的打卡写成一行：心情、日记、关键词、天气、鼓励语', () => {
    const line = todayCheckInLine(FULL);

    expect(line).toContain('「焦虑」');
    expect(line).toContain('今天加班到十点，回家躺着睡不着。');
    expect(line).toContain('加班、睡不着');
    expect(line).toContain('先陪自己站一会儿');
    expect(line).toContain('雨');
  });

  it('模型看不到枚举字面量（要修的就是它现在读到 anxious 而不是「焦虑」）', () => {
    const line = todayCheckInLine(FULL);

    expect(line).not.toContain('anxious');
    expect(line).not.toContain('rain');
  });

  it('关键词标成线索，不许照着念', () => {
    expect(todayCheckInLine(FULL)).toContain('别照着念');
  });

  it('问候用得着的那版：不给天气和鼓励语，那两句就不出现', () => {
    const line = todayCheckInLine({
      moodType: MoodType.calm,
      content: '今天很稳',
      keywords: ['散步'],
    });

    expect(line).toContain('今天很稳');
    expect(line).toContain('散步');
    expect(line).not.toContain('天气');
    expect(line).not.toContain('精灵在打卡时说过');
  });

  it('没抽出关键词时说清楚，而不是整段省掉', () => {
    const line = todayCheckInLine({
      moodType: MoodType.calm,
      content: '还行',
      keywords: [],
    });

    expect(line).toContain('（没抽出关键词）');
  });

  it('日记本来就以句号结尾时不出现两个句号', () => {
    const line = todayCheckInLine({
      moodType: MoodType.calm,
      content: '今天很稳，晚上散了步。',
      keywords: ['散步'],
      aiReply: '岛上很安静。',
    });

    expect(line).not.toContain('。。');
    expect(line).toContain('日记：今天很稳，晚上散了步。');
    expect(line).toContain('精灵在打卡时说过：岛上很安静。');
  });

  it('五种情绪都写中文名', () => {
    const pairs: [MoodType, string][] = [
      [MoodType.ecstatic, '狂喜'],
      [MoodType.calm, '平静'],
      [MoodType.tired, '疲惫'],
      [MoodType.anxious, '焦虑'],
      [MoodType.sad, '悲伤'],
    ];

    for (const [moodType, label] of pairs) {
      const line = todayCheckInLine({ moodType, content: 'x', keywords: [] });
      expect(line).toContain(`「${label}」`);
      expect(line).not.toContain(moodType);
    }
  });
});

describe('checkInKeywords', () => {
  it('从打卡记录挂着的图谱节点上读出关键词', () => {
    expect(
      checkInKeywords({ nodes: [{ keyword: '加班' }, { keyword: '失眠' }] }),
    ).toEqual(['加班', '失眠']);
  });

  it('没有记录、没有节点、节点为空都给空数组', () => {
    expect(checkInKeywords(null)).toEqual([]);
    expect(checkInKeywords(undefined)).toEqual([]);
    expect(checkInKeywords({})).toEqual([]);
    expect(checkInKeywords({ nodes: [] })).toEqual([]);
  });

  it('最多五个（历史数据里可能更多）', () => {
    const nodes = ['一', '二', '三', '四', '五', '六', '七'].map((keyword) => ({
      keyword,
    }));

    expect(checkInKeywords({ nodes })).toEqual(['一', '二', '三', '四', '五']);
  });

  it('丢掉空词和重复词', () => {
    const nodes = [
      { keyword: '加班' },
      { keyword: '   ' },
      { keyword: '加班' },
      { keyword: '失眠' },
    ];

    expect(checkInKeywords({ nodes })).toEqual(['加班', '失眠']);
  });
});

describe('keywordText', () => {
  it('用顿号串起来', () => {
    expect(keywordText(['加班', '失眠'])).toBe('加班、失眠');
  });

  it('空列表给一句占位', () => {
    expect(keywordText([])).toBe('（没抽出关键词）');
  });
});

describe('NO_CHECKIN_LINE', () => {
  it('沿用聊天里原本那句', () => {
    expect(NO_CHECKIN_LINE).toBe('今天还没有打卡，按平静、晴天陪伴。');
  });
});
