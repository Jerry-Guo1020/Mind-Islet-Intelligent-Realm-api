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
    onReasoning?: (text: string) => void,
  ): Promise<string> {
    const response = await this.request(model, messages, true);
    if (!response.body) {
      const message = readMessage(await response.json());
      if (message.reasoning && onReasoning) onReasoning(message.reasoning);
      if (message.content) onDelta(message.content);
      return message.content;
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
        if (delta.reasoning && onReasoning) onReasoning(delta.reasoning);
        if (!delta.content) continue;
        full += delta.content;
        onDelta(delta.content);
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

interface ModelMessage {
  content: string;
  reasoning: string;
}

function readMessage(data: unknown): ModelMessage {
  if (!data || typeof data !== 'object') return { content: '', reasoning: '' };
  const message = (
    data as {
      choices?: {
        message?: { content?: string; reasoning_content?: string };
      }[];
    }
  ).choices?.[0]?.message;
  return {
    content: message?.content ?? '',
    reasoning: message?.reasoning_content ?? '',
  };
}

function readContent(data: unknown): string {
  return readMessage(data).content;
}

/**
 * 一行 SSE 里可能同时有正文和思考，所以返回两段而不是一个字符串。
 * 思考字段是推理模型才有的 reasoning_content（和 OpenAI 的 delta 同层）。
 */
function parseSseLine(line: string): ModelMessage | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    const parsed = JSON.parse(payload) as {
      choices?: {
        delta?: { content?: string; reasoning_content?: string };
      }[];
    };
    const delta = parsed.choices?.[0]?.delta;
    if (!delta) return null;
    const content = delta.content ?? '';
    const reasoning = delta.reasoning_content ?? '';
    if (!content && !reasoning) return null;
    return { content, reasoning };
  } catch {
    return null;
  }
}
