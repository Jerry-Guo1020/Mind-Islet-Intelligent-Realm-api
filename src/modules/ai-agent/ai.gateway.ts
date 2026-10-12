import { IncomingMessage } from 'http';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthService } from '../auth/auth.service';
import { CompanionService } from './companion.service';

interface ClientMessage {
  message?: string;
  timestamp?: number;
  currentMood?: string;
  userId?: string;
}

/** 单条消息的长度上限。超出的直接退回，不进模型。 */
export const MAX_MESSAGE_LENGTH = 500;

export type ParsedClientMessage =
  | { ok: true; message: string; currentMood?: string }
  | { ok: false; reason: string };

/** 小程序发来的原文可能是任何东西，先收窄再交给精灵。 */
export function parseClientMessage(raw: string): ParsedClientMessage {
  let body: ClientMessage;
  try {
    body = JSON.parse(raw) as ClientMessage;
  } catch {
    return { ok: false, reason: 'invalid message' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'invalid message' };
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return { ok: false, reason: 'message is required' };
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: `message 超过 ${MAX_MESSAGE_LENGTH} 字` };
  }
  return { ok: true, message, currentMood: body.currentMood };
}

@Injectable()
export class AiGateway implements OnModuleInit, OnModuleDestroy {
  private server?: WebSocketServer;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly auth: AuthService,
    private readonly companion: CompanionService,
  ) {}

  onModuleInit() {
    const httpServer: unknown = this.adapterHost.httpAdapter.getHttpServer();
    this.server = new WebSocketServer({
      server: httpServer as import('http').Server,
      path: '/api/ai',
    });
    this.server.on('connection', (socket, request) => {
      void this.handleConnection(socket, request);
    });
  }

  async onModuleDestroy() {
    const server = this.server;
    if (!server) return;
    // 先断开长连接，否则 close 的回调要等到所有客户端自己走才会触发，
    // 进程收到 SIGTERM 时会一直等下去。
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handleConnection(socket: WebSocket, request: IncomingMessage) {
    const header = request.headers.authorization;
    const protocol = request.headers['sec-websocket-protocol'];
    const token =
      header ??
      (typeof protocol === 'string' ? `Bearer ${protocol}` : undefined);
    let userId = '';
    try {
      userId = (await this.auth.authenticate(token)).id;
    } catch {
      socket.send(
        JSON.stringify({ type: 'error', msg: 'User token is no longer valid' }),
      );
      socket.close();
      return;
    }

    socket.on('message', (raw) => {
      const text = Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString('utf8')
          : Buffer.from(raw).toString('utf8');
      void this.handleMessage(socket, userId, text);
    });
  }

  private async handleMessage(socket: WebSocket, userId: string, raw: string) {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      socket.send(JSON.stringify({ type: 'error', msg: parsed.reason }));
      return;
    }
    await this.companion.respond(
      { userId, message: parsed.message, currentMood: parsed.currentMood },
      (event) => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify(event));
      },
    );
  }
}
