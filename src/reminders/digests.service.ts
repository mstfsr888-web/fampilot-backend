import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { sendPush } from '../push';

@Injectable()
export class DigestsService {
  private readonly log = new Logger('Digests');
  constructor(private prisma: PrismaService) {}

  // Daily morning briefing. (For multi-timezone families, run hourly and filter by family-local 7am.)
  @Cron('0 7 * * *')
  async sendMorningDigests() {
    const families = await this.prisma.family.findMany({ include: { users: true } });
    const now = new Date();
    const in72 = new Date(now.getTime() + 72 * 3600 * 1000);
    for (const fam of families) {
      const events = await this.prisma.event.findMany({
        where: { familyId: fam.id, startTime: { gte: now, lt: in72 } },
        orderBy: { startTime: 'asc' },
      });
      if (!events.length) continue;
      const body = `${events.length} thing(s) coming up — next: ${events[0].title}`;
      for (const u of fam.users) await sendPush(u.pushToken, 'Your family this week', body);
      this.log.log(`Digest for ${fam.name}: ${events.length} events`);
    }
  }
}
