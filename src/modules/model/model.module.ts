import { Module } from '@nestjs/common';
import { MODEL_CLIENT } from './model.client';
import { OpenAiModelClient } from './openai-model.client';

/**
 * OpenAI 兼容的模型客户端。ai-agent 与 records 都从这里取用，
 * 让打卡鼓励语不必依赖精灵聊天模块。模型密钥只留在服务端。
 */
@Module({
  providers: [
    OpenAiModelClient,
    { provide: MODEL_CLIENT, useExisting: OpenAiModelClient },
  ],
  exports: [MODEL_CLIENT],
})
export class ModelModule {}
