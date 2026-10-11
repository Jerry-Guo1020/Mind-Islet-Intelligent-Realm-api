import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { WechatClient, WechatSession } from './wechat.client';

@Injectable()
export class HttpWechatClient implements WechatClient {
  async codeToSession(code: string): Promise<WechatSession> {
    const mockOpenid = process.env.WECHAT_MOCK_OPENID?.trim();
    if (mockOpenid) {
      return { openid: mockOpenid };
    }

    const appId = process.env.WX_APPID?.trim();
    const secret = process.env.WX_APPSECRET?.trim();
    if (!appId || !secret) {
      throw new ServiceUnavailableException(
        'WeChat login is not configured on the server',
      );
    }

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appId);
    url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new ServiceUnavailableException(
        'WeChat login is temporarily unavailable',
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'WeChat login is temporarily unavailable',
      );
    }

    let data: { openid?: string; errcode?: number };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new ServiceUnavailableException(
        'WeChat login is temporarily unavailable',
      );
    }
    if (data.errcode || !data.openid?.trim()) {
      throw new UnauthorizedException('WeChat login failed');
    }
    return { openid: data.openid.trim() };
  }
}
