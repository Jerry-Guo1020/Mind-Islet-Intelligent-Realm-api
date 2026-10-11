import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { AuthService, type LoginInput } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('api/auth/guest-login')
  async guestLogin(@Body() body: LoginInput) {
    return ok(await this.auth.login(body), 'login success');
  }

  @Post('api/auth/wechat-login')
  async wechatLogin(@Body() body: LoginInput) {
    return ok(await this.auth.login(body), 'login success');
  }

  @Post('api/auth/logout')
  async logout(@Headers('authorization') authorization?: string) {
    return ok(await this.auth.logout(authorization), 'logout success');
  }
}
