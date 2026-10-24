import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ok } from '../../common/api-response';
import { AuthGuard } from '../../common/guards/auth.guard';
import { IslandService } from './island.service';

interface AuthedRequest extends Request {
  user: { id: string };
}

@Controller('api/island')
@UseGuards(AuthGuard)
export class IslandController {
  constructor(private readonly island: IslandService) {}

  @Get('assets')
  async assets(@Req() request: AuthedRequest) {
    return ok(await this.island.listAssets(request.user.id));
  }

  @Get('state')
  async state(@Req() request: AuthedRequest) {
    return ok(await this.island.state(request.user.id));
  }

  @Post('redeem')
  async redeem(
    @Req() request: AuthedRequest,
    @Body() body: { itemId: string; season?: string },
  ) {
    return ok(
      await this.island.redeem(request.user.id, body.itemId, body.season),
    );
  }

  @Post('season/next')
  async nextSeason(@Req() request: AuthedRequest) {
    return ok(await this.island.nextSeason(request.user.id));
  }

  @Get('weather')
  async weather(@Req() request: AuthedRequest) {
    return ok(await this.island.weather(request.user.id));
  }

  @Get('assets/:id')
  async asset(@Req() request: AuthedRequest, @Param('id') id: string) {
    return ok(await this.island.getAsset(request.user.id, id));
  }
}
