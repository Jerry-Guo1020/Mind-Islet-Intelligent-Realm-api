import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { AuthModule } from './modules/auth/auth.module';
import { IslandModule } from './modules/island/island.module';
import { MailboxModule } from './modules/mailbox/mailbox.module';
import { MeModule } from './modules/me/me.module';
import { RecordsModule } from './modules/records/records.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    IslandModule,
    RecordsModule,
    AiAgentModule,
    MailboxModule,
    MeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
