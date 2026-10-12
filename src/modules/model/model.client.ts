export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelClient {
  complete(model: string, messages: ChatTurn[]): Promise<string>;
  stream(
    model: string,
    messages: ChatTurn[],
    onDelta: (text: string) => void,
  ): Promise<string>;
}

export const MODEL_CLIENT = 'MODEL_CLIENT';
