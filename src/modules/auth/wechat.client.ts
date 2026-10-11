export interface WechatSession {
  openid: string;
}

export interface WechatClient {
  codeToSession(code: string): Promise<WechatSession>;
}
