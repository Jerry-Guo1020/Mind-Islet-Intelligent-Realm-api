import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecordsModule } from '../records/records.module';
import { MailboxController } from './mailbox.controller';
import { MailboxService } from './mailbox.service';

@Module({
  imports: [AuthModule, RecordsModule],
  controllers: [MailboxController],
  providers: [MailboxService],
})
export class MailboxModule {}
