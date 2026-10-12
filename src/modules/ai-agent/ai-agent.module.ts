import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModelModule } from '../model/model.module';
import { AiGateway } from './ai.gateway';
import { CompanionService } from './companion.service';

/** 蒸馏模型 API 的流式转发。模型密钥不下发到小程序。 */
@Module({
  imports: [AuthModule, ModelModule],
  providers: [CompanionService, AiGateway],
})
export class AiAgentModule {}
