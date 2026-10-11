import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService, WECHAT_CLIENT } from './auth.service';
import { HttpWechatClient } from './http-wechat.client';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    HttpWechatClient,
    { provide: WECHAT_CLIENT, useExisting: HttpWechatClient },
  ],
  exports: [AuthService],
})
export class AuthModule {}
