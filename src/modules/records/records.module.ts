import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TemplateEncouragement } from './encouragement';
import { RecordsController } from './records.controller';
import { ENCOURAGEMENT_WRITER, RecordsService } from './records.service';

@Module({
  imports: [AuthModule],
  controllers: [RecordsController],
  providers: [
    RecordsService,
    TemplateEncouragement,
    { provide: ENCOURAGEMENT_WRITER, useExisting: TemplateEncouragement },
  ],
  exports: [RecordsService, ENCOURAGEMENT_WRITER],
})
export class RecordsModule {}
