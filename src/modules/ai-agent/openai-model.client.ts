import { Injectable } from '@nestjs/common';
import { ChatTurn, ModelClient } from './model.client';

@Injectable()
export class OpenAiModelClient implements ModelClient {
  async complete(model: string, messages: ChatTurn[]): Promise<string> {
    const data = await this.post(model, messages, false);
    return readContent(data);
  }

  async stream(
    model: string,
    messages: ChatTurn[],
    onDelta: (text: string) => void,
  ): Promise<string> {
    const response = await this.request(model, messages, true);
    if (!response.body) {
      const text = readContent(await response.json());
      if (text) onDelta(text);
      return text;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const delta = parseSseLine(line);
        if (!delta) continue;
        full += delta;
        onDelta(delta);
      }
    }
    return full;
  }

  private async post(model: string, messages: ChatTurn[], stream: boolean) {
    const response = await this.request(model, messages, stream);
    return (await response.json()) as unknown;
  }

  private async request(model: string, messages: ChatTurn[], stream: boolean) {
    const base = (
      process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
    ).replace(/\/$/, '');
    const key = process.env.AI_API_KEY?.trim();
    if (!key) throw new Error('AI_API_KEY is not configured');
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, stream }),
      signal: AbortSignal.timeout(stream ? 60000 : 15000),
    });
    if (!response.ok)
      throw new Error(`model request failed: ${response.status}`);
    return response;
  }
}

function readContent(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choice = (data as { choices?: { message?: { content?: string } }[] })
    .choices?.[0];
  return choice?.message?.content ?? '';
}

function parseSseLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return '';
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') return '';
  try {
    const parsed = JSON.parse(payload) as {
      choices?: { delta?: { content?: string } }[];
    };
    return parsed.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}
