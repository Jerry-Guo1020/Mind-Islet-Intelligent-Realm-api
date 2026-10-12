import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModelModule } from '../model/model.module';
import { ProgressModule } from '../progress/progress.module';
import {
  AiEncouragement,
  encouragementWriterFactory,
} from './ai-encouragement';
import { TemplateEncouragement } from './encouragement';
import { RecordsController } from './records.controller';
import { ENCOURAGEMENT_WRITER, RecordsService } from './records.service';

@Module({
  imports: [AuthModule, ModelModule, ProgressModule],
  controllers: [RecordsController],
  providers: [
    RecordsService,
    TemplateEncouragement,
    AiEncouragement,
    {
      provide: ENCOURAGEMENT_WRITER,
      useFactory: encouragementWriterFactory,
      inject: [AiEncouragement, TemplateEncouragement],
    },
  ],
  exports: [RecordsService, ENCOURAGEMENT_WRITER],
})
export class RecordsModule {}
