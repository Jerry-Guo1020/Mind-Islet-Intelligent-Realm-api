import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ok } from '../../common/api-response';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ChatHistoryService } from './chat-history.service';
import { GreetingService } from './greeting.service';

interface AuthedRequest extends Request {
  user: { id: string };
}

/** 精灵的 HTTP 部分。对话本身走 WebSocket。 */
@Controller('api/ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(
    private readonly greeting: GreetingService,
    private readonly history: ChatHistoryService,
  ) {}

  @Get('greeting')
  async greetingToday(@Req() request: AuthedRequest) {
    return ok(await this.greeting.greeting(request.user.id));
  }

  @Get('messages')
  async messages(
    @Req() request: AuthedRequest,
    @Query() query: { limit?: unknown; before?: unknown; since?: unknown },
  ) {
    await this.history.purgeExpired();
    return ok(await this.history.messages(request.user.id, query));
  }
}
