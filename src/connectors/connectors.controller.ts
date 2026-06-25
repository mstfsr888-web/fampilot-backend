import { Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { GmailService } from './gmail.service';

@Controller('connectors')
export class ConnectorsController {
  constructor(private gmail: GmailService) {}

  @UseGuards(JwtGuard)
  @Get()
  list(@CurrentUser() u) { return this.gmail.list(u.familyId); }

  @UseGuards(JwtGuard)
  @Get('gmail/auth-url')
  authUrl(@CurrentUser() u) { return this.gmail.authUrl(u.familyId, u.userId); }

  // Public: Google redirects the browser here.
  @Get('gmail/callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const { email } = await this.gmail.handleCallback(code, state);
      const back = process.env.POST_CONNECT_REDIRECT;
      if (back) return res.redirect(`${back}?connected=${encodeURIComponent(email)}`);
      return res.send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>Gmail connected ✓</h2><p>${email}</p><p>You can close this window and return to FamPilot.</p></body></html>`);
    } catch (e: any) {
      return res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px">Error: ${e.message}</body></html>`);
    }
  }

  @UseGuards(JwtGuard)
  @Post('gmail/sync')
  sync(@CurrentUser() u) { return this.gmail.sync(u.familyId); }

  @UseGuards(JwtGuard)
  @Delete(':id')
  disconnect(@CurrentUser() u, @Param('id') id) { return this.gmail.disconnect(u.familyId, id); }
}
