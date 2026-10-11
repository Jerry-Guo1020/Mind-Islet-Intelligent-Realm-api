import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ok } from '../../common/api-response';
import { AuthGuard } from '../../common/guards/auth.guard';
import { MailboxService, type MailboxQuery } from './mailbox.service';

interface AuthedRequest extends Request {
  user: { id: string };
}

@Controller('api/mailbox')
@UseGuards(AuthGuard)
export class MailboxController {
  constructor(private readonly mailbox: MailboxService) {}

  @Get('graph')
  async graph(@Req() request: AuthedRequest, @Query() query: MailboxQuery) {
    return ok(await this.mailbox.graph(request.user.id, query));
  }

  @Get('nodes/:id/letters')
  async letters(
    @Req() request: AuthedRequest,
    @Param('id') id: string,
    @Query() query: MailboxQuery,
  ) {
    return ok(await this.mailbox.letters(request.user.id, id, query));
  }

  @Get('letters/:recordId')
  async letter(
    @Req() request: AuthedRequest,
    @Param('recordId') recordId: string,
    @Query() query: MailboxQuery,
  ) {
    return ok(await this.mailbox.letter(request.user.id, recordId, query));
  }
}
