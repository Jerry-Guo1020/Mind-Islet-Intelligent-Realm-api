const STOP_WORDS = new Set([
  '今天',
  '昨天',
  '我们',
  '他们',
  '自己',
  '这个',
  '那个',
  '因为',
  '所以',
  '如果',
  '但是',
  '然后',
  '一个',
  '没有',
  '什么',
  '怎么',
  '时候',
  '觉得',
  '感觉',
  '可以',
  '已经',
  '还是',
  '不是',
  '就是',
  '的',
  '了',
  '和',
  '与',
]);

/** 从打卡正文抽出最多 5 个关键词。按标点和空白切开，丢掉停用词。 */
export function extractKeywords(content: string): string[] {
  const parts = content
    .split(/[^\u4e00-\u9fffA-Za-z0-9]+/)
    .map((part) => part.trim().replace(/^(今天|昨天|我们|他们)/, ''))
    .filter((part) => part.length >= 2 && part.length <= 12);
  const unique: string[] = [];
  for (const keyword of parts) {
    if (STOP_WORDS.has(keyword) || unique.includes(keyword)) continue;
    unique.push(keyword);
    if (unique.length === 5) break;
  }
  return unique.length > 0 ? unique : ['日记'];
}
