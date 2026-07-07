import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AiService } from './ai.service';
import { EventsService } from '../events/events.service';
import { TasksService } from '../tasks/tasks.service';
import { ListsService } from '../lists/lists.service';
import { MealsService } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtGuard)
@Controller()
export class AiController {
  constructor(private ai: AiService, private events: EventsService, private tasks: TasksService, private lists: ListsService, private meals: MealsService, private prisma: PrismaService) {}

  @Post('ai/capture')
  capture(@CurrentUser() u, @Body() body: { text?: string; image?: { data: string; mediaType?: string }; lang?: string }) {
    return this.ai.capture(u.familyId, body.text, body.image, body.lang);
  }

  @Post('ai/suggest-assignee')
  suggest(@CurrentUser() u, @Body() body) {
    return this.ai.suggest(u.familyId, body);
  }

  // Runs the assistant and executes any create actions server-side.
  @Post('assistant/chat')
  async chat(@CurrentUser() u, @Body() body: { messages: any[]; lang?: string; execute?: boolean }) {
    const result = await this.ai.assistant(u.familyId, body.messages || [], body.lang);
    if (body.execute === false) return result;
    const EVENT_TYPES = ['school', 'health', 'activity', 'social', 'other'];
    let validChildIds: Set<string> | null = null;
    for (const a of result.actions || []) {
      try {
        if (a.type === 'suggest') continue; // proposals execute client-side on tap
        if (a.type === 'create_event' && a.start_iso) {
          const start = new Date(a.start_iso);
          if (isNaN(start.getTime())) continue;
          if (validChildIds === null) {
            const kids = await this.prisma.child.findMany({ where: { familyId: u.familyId }, select: { id: true } });
            validChildIds = new Set(kids.map((k: any) => k.id));
          }
          const recur = a.recur === 'daily' || a.recur === 'weekly' ? a.recur : 'none';
          const dup = await this.prisma.event.findFirst({ where: { familyId: u.familyId, title: { equals: String(a.title || ''), mode: 'insensitive' }, startTime: start, status: { not: 'cancelled' } } });
          if (dup) continue;
          await this.events.create(u.familyId, u.userId, {
            title: String(a.title || 'Event').slice(0, 200),
            start: start.toISOString(),
            allDay: !!a.all_day,
            type: EVENT_TYPES.includes(a.event_type) ? a.event_type : 'other',
            childId: a.child_id && validChildIds.has(a.child_id) ? a.child_id : null,
            recur,
            source: 'assistant',
          });
        } else if (a.type === 'create_task' && a.title) {
          const due = a.due_iso ? new Date(a.due_iso) : null;
          await this.tasks.create(u.familyId, { title: String(a.title).slice(0, 200), due: due && !isNaN(due.getTime()) ? due.toISOString() : null });
        } else if (a.type === 'add_shop_item' && a.title) {
          await this.lists.create(u.familyId, { title: a.title, list: 'shopping' });
        } else if ((a.type === 'check_shop_item' || a.type === 'remove_shop_item') && a.title) {
          const items = await this.lists.list(u.familyId, { list: 'shopping' });
          const hit = items.find((x) => x.title.toLowerCase() === String(a.title).toLowerCase()) || items.find((x) => x.title.toLowerCase().includes(String(a.title).toLowerCase()));
          if (hit) {
            if (a.type === 'remove_shop_item') await this.lists.remove(u.familyId, hit.id);
            else await this.lists.update(u.familyId, hit.id, { done: true });
          }
        } else if (a.type === 'update_event' && a.title) {
          const ev = await this.findEventByTitle(u.familyId, a.title, a.date_iso);
          if (ev) {
            const data: any = {};
            if (a.new_title) data.title = String(a.new_title).slice(0, 200);
            if (a.start_iso) { const s = new Date(a.start_iso); if (!isNaN(s.getTime())) data.startTime = s; }
            if (a.all_day !== undefined) data.allDay = !!a.all_day;
            if (a.recur === 'daily' || a.recur === 'weekly' || a.recur === 'none') data.recur = a.recur;
            if (Object.keys(data).length) await this.prisma.event.update({ where: { id: ev.id }, data });
          }
        } else if (a.type === 'delete_event' && a.title) {
          const ev = await this.findEventByTitle(u.familyId, a.title, a.date_iso);
          if (ev) await this.prisma.event.update({ where: { id: ev.id }, data: { status: 'cancelled' } });
        } else if (a.type === 'set_meal' && a.date_iso) {
          const d = new Date(a.date_iso);
          if (!isNaN(d.getTime())) await this.meals.upsert(u.familyId, { date: d.toISOString(), slot: 'dinner', title: a.title || '' });
        }
      } catch (e) {
        // one bad action must never kill the whole reply
        console.error('[assistant/chat] action failed', a && a.type, (e as any)?.message);
      }
    }
    return result;
  }

  private async findEventByTitle(familyId: string, title: string, dateIso?: string) {
    const since = new Date(Date.now() - 864e5);
    const evs = await this.prisma.event.findMany({ where: { familyId, status: { not: 'cancelled' }, startTime: { gte: since } }, orderBy: { startTime: 'asc' }, take: 200 });
    const q = String(title).toLowerCase().trim();
    let pool = evs.filter((e) => e.title.toLowerCase() === q);
    if (!pool.length) pool = evs.filter((e) => e.title.toLowerCase().includes(q) || q.includes(e.title.toLowerCase()));
    if (!pool.length) return null;
    if (dateIso) {
      const d = new Date(dateIso);
      if (!isNaN(d.getTime())) {
        const sameDay = pool.filter((e) => e.startTime.toDateString() === d.toDateString());
        if (sameDay.length) return sameDay[0];
      }
    }
    return pool[0];
  }
}
