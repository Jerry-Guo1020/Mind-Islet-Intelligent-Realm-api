import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { MoodType } from '@prisma/client';
import { Request } from 'express';
import { ok } from '../../common/api-response';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RecordsService } from './records.service';

interface AuthedRequest extends Request {
  user: { id: string };
}

@Controller('api/records')
@UseGuards(AuthGuard)
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Post()
  async create(
    @Req() request: AuthedRequest,
    @Body() body: { moodType: MoodType; content: string },
  ) {
    return ok(
      await this.records.create(request.user.id, body),
      'check-in success',
    );
  }
}
