import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ok } from '../../common/api-response';
import { AuthGuard } from '../../common/guards/auth.guard';
import { MeService } from './me.service';

interface AuthedRequest extends Request {
  user: { id: string };
}

@Controller('api/me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  async overview(@Req() request: AuthedRequest) {
    return ok(await this.me.overview(request.user.id));
  }

  @Patch()
  async updateProfile(
    @Req() request: AuthedRequest,
    @Body() body: { nickname?: unknown; avatar?: unknown },
  ) {
    return ok(
      await this.me.updateProfile(request.user.id, body),
      'profile updated',
    );
  }

  @Get('settings')
  async settings(@Req() request: AuthedRequest) {
    return ok(await this.me.settings(request.user.id));
  }

  @Patch('settings')
  async updateSettings(
    @Req() request: AuthedRequest,
    @Body() body: { reminderEnabled?: unknown; reminderTime?: unknown },
  ) {
    return ok(
      await this.me.updateSettings(request.user.id, body),
      'settings updated',
    );
  }

  @Post('spirit/onboard')
  async spiritOnboard(@Req() request: AuthedRequest) {
    return ok(
      await this.me.markSpiritOnboarded(request.user.id),
      'spirit onboarded',
    );
  }
}
