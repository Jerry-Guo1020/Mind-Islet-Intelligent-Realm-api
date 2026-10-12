import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModelModule } from '../model/model.module';
import { AiController } from './ai.controller';
import { AiGateway } from './ai.gateway';
import { ChatHistoryService } from './chat-history.service';
import { CompanionService } from './companion.service';
import { GreetingService } from './greeting.service';

/** 蒸馏模型 API 的流式转发。模型密钥不下发到小程序。 */
@Module({
  imports: [AuthModule, ModelModule],
  controllers: [AiController],
  providers: [CompanionService, AiGateway, GreetingService, ChatHistoryService],
})
export class AiAgentModule {}
