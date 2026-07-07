import { Controller, Get, Header, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

const secret: jwt.Secret = process.env.JWT_SECRET || 'dev-secret';
const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

@Controller('calendar')
export class IcsController {
  constructor(private prisma: PrismaService) {}

  /** Authenticated: returns the family's private ICS subscription URL. */
  @UseGuards(JwtGuard)
  @Get('feed-url')
  feedUrl(@CurrentUser() u) {
    const t = jwt.sign({ familyId: u.familyId, kind: 'ics' }, secret, { expiresIn: '3650d' });
    return { path: `/calendar/feed.ics?t=${t}` };
  }

  /** Public but token-protected ICS feed for Google/Apple Calendar subscription. */
  @Get('feed.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'private, max-age=300')
  async feed(@Query('t') t: string): Promise<string> {
    let familyId: string;
    try {
      const p: any = jwt.verify(t || '', secret);
      if (p.kind !== 'ics' || !p.familyId) throw new Error('bad');
      familyId = p.familyId;
    } catch {
      throw new UnauthorizedException('invalid token');
    }
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const evs = await this.prisma.event.findMany({
      where: { familyId, status: { not: 'cancelled' }, startTime: { gte: since } },
      orderBy: { startTime: 'asc' },
      take: 1000,
      include: { owner: true, child: true },
    });
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FamPilot//Calendar//EN', 'X-WR-CALNAME:FamPilot', 'CALSCALE:GREGORIAN'];
    for (const e of evs) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@fampilot`);
      lines.push(`DTSTAMP:${dt(e.createdAt)}`);
      if (e.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${day(e.startTime)}`);
      } else {
        lines.push(`DTSTART:${dt(e.startTime)}`);
        lines.push(`DTEND:${dt(e.endTime || new Date(e.startTime.getTime() + 3600000))}`);
      }
      const who = e.child?.name || e.owner?.name;
      lines.push(`SUMMARY:${esc(e.title + (who ? ` (${who})` : ''))}`);
      if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
      if (e.recur === 'daily') lines.push('RRULE:FREQ=DAILY');
      if (e.recur === 'weekly') lines.push('RRULE:FREQ=WEEKLY');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}
