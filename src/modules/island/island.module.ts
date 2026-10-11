import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IslandController } from './island.controller';
import { IslandService } from './island.service';

@Module({
  imports: [AuthModule],
  controllers: [IslandController],
  providers: [IslandService],
})
export class IslandModule {}
