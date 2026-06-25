import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { InvitesService } from './invites.service';

@Controller()
export class InvitesController {
  constructor(private invites: InvitesService) {}

  @UseGuards(JwtGuard)
  @Post('families/me/invites')
  create(@CurrentUser() u, @Body() body) { return this.invites.create(u.familyId, u.userId, body); }

  @UseGuards(JwtGuard)
  @Get('families/me/invites')
  list(@CurrentUser() u) { return this.invites.list(u.familyId); }

  // Public — the invited person has no account yet.
  @Post('invites/accept')
  accept(@Body() body) { return this.invites.accept(body); }
}
