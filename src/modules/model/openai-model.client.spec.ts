import { OpenAiModelClient } from './openai-model.client';

/**
 * 网关真实回来的样子：推理模型会把思考单独放在 delta.reasoning_content，
 * 正文放在 delta.content，两者同层、可以交错出现。
 * 这里的样本就是照 deepseek-v4.1-flash 实际返回抄下来的形状。
 */
const SSE = [
  'data: {"choices":[{"delta":{"reasoning_content":"先接住"}}]}',
  'data: {"choices":[{"delta":{"reasoning_content":"情绪。"}}]}',
  'data: {"choices":[{"delta":{"content":"我在"}}]}',
  'data: {"choices":[{"delta":{"content":"。"}}]}',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
  'data: [DONE]',
  '',
].join('\n');

function responseWith(chunks: string[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: {
      getReader() {
        let index = 0;
        return {
          read: () =>
            Promise.resolve(
              index < chunks.length
                ? { value: encoder.encode(chunks[index++]), done: false }
                : { value: undefined, done: true },
            ),
        };
      },
    },
    json: () => Promise.resolve({}),
  };
}

describe('OpenAiModelClient', () => {
  const original = { base: process.env.AI_BASE_URL, key: process.env.AI_API_KEY };

  beforeEach(() => {
    process.env.AI_BASE_URL = 'http://model.test/v1';
    process.env.AI_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.AI_BASE_URL = original.base;
    process.env.AI_API_KEY = original.key;
    jest.restoreAllMocks();
  });

  function mockFetch(chunks: string[]) {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(responseWith(chunks) as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('分开转出思考和正文，SSE 被切在行中间也不丢字', async () => {
    // 故意在第二行中间切开，逼它走 buffer 拼接那条路。
    const cut = SSE.indexOf('情绪。');
    const fetchMock = mockFetch([SSE.slice(0, cut), SSE.slice(cut)]);

    const client = new OpenAiModelClient();
    const content: string[] = [];
    const reasoning: string[] = [];
    const full = await client.stream(
      'large-model',
      [{ role: 'user', content: '我好累' }],
      (text) => content.push(text),
      (text) => reasoning.push(text),
    );

    expect(reasoning.join('')).toBe('先接住情绪。');
    expect(content.join('')).toBe('我在。');
    // 返回值仍然只有正文 —— 思考不进聊天记录。
    expect(full).toBe('我在。');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://model.test/v1/chat/completions');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'large-model',
      stream: true,
    });
  });

  it('没给 onReasoning 时照样只吐正文', async () => {
    mockFetch([SSE]);
    const client = new OpenAiModelClient();
    const content: string[] = [];
    await client.stream('large-model', [], (text) => content.push(text));
    expect(content.join('')).toBe('我在。');
  });
});