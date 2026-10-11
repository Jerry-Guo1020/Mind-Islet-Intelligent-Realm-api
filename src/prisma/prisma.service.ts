import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /** 不在启动时连接。MySQL 未就绪时进程仍可启动，第一次查询再连接。 */
  onModuleInit() {
    return;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
