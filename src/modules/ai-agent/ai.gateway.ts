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
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
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
    let body: ClientMessage;
    try {
      body = JSON.parse(raw) as ClientMessage;
    } catch {
      socket.send(JSON.stringify({ type: 'error', msg: 'invalid message' }));
      return;
    }
    await this.companion.respond(
      { userId, message: body.message ?? '', currentMood: body.currentMood },
      (event) => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify(event));
      },
    );
  }
}
