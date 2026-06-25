import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';
import { suggestOwner } from '../common/assignment';
import { RemindersService } from '../reminders/reminders.service';

const DEFAULT_OFFSET: Record<string, number> = { school: 1440, health: 1440, activity: 120, social: 120, other: 120 };

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService, private reminders: RemindersService) {}

  list(familyId: string, q: { from?: string; to?: string; childId?: string; ownerId?: string; status?: string }) {
    const where: any = { familyId };
    if (q.from || q.to) where.startTime = {};
    if (q.from) where.startTime.gte = new Date(q.from);
    if (q.to) where.startTime.lt = new Date(q.to);
    if (q.childId) where.childId = q.childId;
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.status) where.status = q.status;
    return this.prisma.event.findMany({ where, orderBy: { startTime: 'asc' } });
  }

  async create(familyId: string, createdBy: string, body: any) {
    const type = body.type || 'other';
    let ownerId = body.ownerId;
    let suggestedReason: string | undefined;
    if (ownerId === undefined && body.autoAssign !== false) {
      const s = await suggestOwner(this.prisma, familyId, { type, childId: body.childId, start: body.start ? new Date(body.start) : null });
      ownerId = s.ownerId;
      suggestedReason = s.reason;
    }
    const event = await this.prisma.event.create({
      data: {
        id: newId('evt'),
        familyId,
        title: body.title,
        description: body.description,
        startTime: new Date(body.start),
        endTime: body.end ? new Date(body.end) : null,
        allDay: !!body.allDay,
        location: body.location,
        type,
        recur: body.recur || 'none',
        childId: body.childId || null,
        ownerId: ownerId || null,
        status: body.status || 'confirmed',
        source: body.source || 'manual',
        reminderOffsetMin: body.reminderOffsetMin ?? DEFAULT_OFFSET[type] ?? 120,
      },
    });
    if (event.status === 'confirmed') await this.reminders.scheduleForEvent(event);
    return { ...event, suggestedReason };
  }

  get(familyId: string, id: string) {
    return this.prisma.event.findFirst({ where: { id, familyId } });
  }

  async update(familyId: string, id: string, body: any) {
    const existing = await this.prisma.event.findFirst({ where: { id, familyId } });
    if (!existing) throw new NotFoundException('Event not found');
    const data: any = { ...body };
    if (body.start) data.startTime = new Date(body.start);
    if (body.end) data.endTime = new Date(body.end);
    delete data.start; delete data.end; delete data.autoAssign;
    const event = await this.prisma.event.update({ where: { id }, data });
    // Reschedule reminders if timing changed.
    if (body.start || body.reminderOffsetMin !== undefined || body.ownerId !== undefined) {
      await this.reminders.cancelForEvent(id);
      if (event.status === 'confirmed') await this.reminders.scheduleForEvent(event);
    }
    return event;
  }

  async remove(familyId: string, id: string) {
    await this.reminders.cancelForEvent(id);
    await this.prisma.event.deleteMany({ where: { id, familyId } });
    return { ok: true };
  }
}
