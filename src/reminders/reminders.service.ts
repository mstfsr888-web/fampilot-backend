import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';
import { remindersQueue } from '../queue';

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  // Create reminder rows for an event and enqueue delayed push jobs.
  async scheduleForEvent(event: { id: string; familyId: string; startTime: Date; ownerId?: string | null; reminderOffsetMin?: number | null }) {
    const offset = event.reminderOffsetMin ?? 120;
    const remindAt = new Date(new Date(event.startTime).getTime() - offset * 60000);
    const reminder = await this.prisma.reminder.create({
      data: {
        id: newId('rmd'),
        familyId: event.familyId,
        eventId: event.id,
        targetUserId: event.ownerId || null,
        remindAt,
        offsetMinutes: offset,
        channel: 'push',
        state: 'scheduled',
      },
    });
    const delay = Math.max(0, remindAt.getTime() - Date.now());
    const job = await remindersQueue.add('fire', { reminderId: reminder.id }, { delay, removeOnComplete: true });
    await this.prisma.reminder.update({ where: { id: reminder.id }, data: { jobId: job.id } });
    return reminder;
  }

  async cancelForEvent(eventId: string) {
    const rows = await this.prisma.reminder.findMany({ where: { eventId, state: 'scheduled' } });
    for (const r of rows) {
      if (r.jobId) { const job = await remindersQueue.getJob(r.jobId); if (job) await job.remove().catch(() => {}); }
    }
    await this.prisma.reminder.updateMany({ where: { eventId, state: 'scheduled' }, data: { state: 'dismissed' } });
  }
}
