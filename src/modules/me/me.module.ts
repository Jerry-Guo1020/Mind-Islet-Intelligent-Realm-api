import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProgressModule } from '../progress/progress.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

/** 个人中心 P10 与 P11、P12：资料、设置、精灵引导标记。 */
@Module({
  imports: [AuthModule, ProgressModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
