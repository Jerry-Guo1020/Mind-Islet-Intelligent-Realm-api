import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiGateway } from './ai.gateway';
import { CompanionService } from './companion.service';
import { MODEL_CLIENT } from './model.client';
import { OpenAiModelClient } from './openai-model.client';

/** 蒸馏模型 API 的流式转发。模型密钥不下发到小程序。 */
@Module({
  imports: [AuthModule],
  providers: [
    CompanionService,
    AiGateway,
    OpenAiModelClient,
    { provide: MODEL_CLIENT, useExisting: OpenAiModelClient },
  ],
})
export class AiAgentModule {}
