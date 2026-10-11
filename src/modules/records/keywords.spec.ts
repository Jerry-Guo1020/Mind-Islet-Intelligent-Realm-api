import { extractKeywords } from './keywords';

describe('extractKeywords', () => {
  it('keeps distinct chinese words and drops stop words', () => {
    expect(extractKeywords('今天考试，朋友也在熬夜')).toEqual([
      '考试',
      '朋友也在熬夜',
    ]);
  });

  it('falls back to a single diary node when nothing usable remains', () => {
    expect(extractKeywords('今天')).toEqual(['日记']);
  });
});
