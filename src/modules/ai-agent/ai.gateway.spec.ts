import { MAX_MESSAGE_LENGTH, parseClientMessage } from './ai.gateway';

describe('parseClientMessage', () => {
  it('passes a normal message through, trimmed', () => {
    expect(
      parseClientMessage(
        JSON.stringify({ message: '  今天有点累  ', currentMood: 'tired' }),
      ),
    ).toEqual({ ok: true, message: '今天有点累', currentMood: 'tired' });
  });

  it('rejects text that is not JSON', () => {
    expect(parseClientMessage('今天有点累')).toEqual({
      ok: false,
      reason: 'invalid message',
    });
  });

  it('rejects JSON that is not an object', () => {
    expect(parseClientMessage('"今天有点累"')).toEqual({
      ok: false,
      reason: 'invalid message',
    });
    expect(parseClientMessage('[1,2]')).toEqual({
      ok: false,
      reason: 'invalid message',
    });
    expect(parseClientMessage('null')).toEqual({
      ok: false,
      reason: 'invalid message',
    });
  });

  it('rejects a missing or blank message', () => {
    expect(parseClientMessage(JSON.stringify({}))).toEqual({
      ok: false,
      reason: 'message is required',
    });
    expect(parseClientMessage(JSON.stringify({ message: '   ' }))).toEqual({
      ok: false,
      reason: 'message is required',
    });
    expect(parseClientMessage(JSON.stringify({ message: 42 }))).toEqual({
      ok: false,
      reason: 'message is required',
    });
  });

  it('rejects a message longer than the limit', () => {
    const long = '好'.repeat(MAX_MESSAGE_LENGTH + 1);

    expect(parseClientMessage(JSON.stringify({ message: long }))).toEqual({
      ok: false,
      reason: `message 超过 ${MAX_MESSAGE_LENGTH} 字`,
    });
  });

  it('accepts a message exactly at the limit', () => {
    const exact = '好'.repeat(MAX_MESSAGE_LENGTH);

    expect(parseClientMessage(JSON.stringify({ message: exact }))).toEqual({
      ok: true,
      message: exact,
      currentMood: undefined,
    });
  });

  it('only keeps whitespace-trimmed text, so padding cannot smuggle length', () => {
    const padded = `  ${'好'.repeat(MAX_MESSAGE_LENGTH)}  `;

    expect(
      parseClientMessage(JSON.stringify({ message: padded })),
    ).toMatchObject({ ok: true });
  });
});
