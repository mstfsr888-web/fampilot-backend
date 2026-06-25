import { Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { GmailService } from './gmail.service';

@Controller('connectors')
export class GmailController {
  constructor(private gmail: GmailService) {}

  @UseGuards(JwtGuard) @Get('gmail/auth-url')
  authUrl(@CurrentUser() u) { return this.gmail.authUrl(u.familyId); }

  // Public — Google redirects the browser to this URL.
  @Get('gmail/callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: any) {
    try {
      await this.gmail.handleCallback(code, state);
      res.send('<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>Gmail connected &#10003;</h2><p>You can close this tab and return to FamPilot.</p></body></html>');
    } catch (e) {
      res.status(400).send('<html><body style="font-family:sans-serif;padding:40px">Connection failed. Please try again.</body></html>');
    }
  }

  @UseGuards(JwtGuard) @Post('gmail/sync')
  sync(@CurrentUser() u) { return this.gmail.sync(u.familyId); }

  @UseGuards(JwtGuard) @Get()
  list(@CurrentUser() u) { return this.gmail.list(u.familyId); }

  @UseGuards(JwtGuard) @Delete('gmail')
  disconnect(@CurrentUser() u) { return this.gmail.disconnect(u.familyId); }
}
