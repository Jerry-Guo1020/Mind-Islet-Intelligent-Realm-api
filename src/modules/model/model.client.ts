export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelClient {
  complete(model: string, messages: ChatTurn[]): Promise<string>;
  /**
   * onDelta 收正文增量；onReasoning 收推理模型的思考过程。
   *
   * 不是所有模型都吐思考：网关上的推理模型会在 delta.reasoning_content 里
   * 单独送一段（实测首段 166ms 就到，正文 3.2s 才来），普通模型没有这个字段。
   * 有就转出来，没有就当作没有，调用方不用判断模型类型。
   */
  stream(
    model: string,
    messages: ChatTurn[],
    onDelta: (text: string) => void,
    onReasoning?: (text: string) => void,
  ): Promise<string>;
}

export const MODEL_CLIENT = 'MODEL_CLIENT';
