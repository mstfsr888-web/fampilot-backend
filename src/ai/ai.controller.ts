import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AiService } from './ai.service';
import { EventsService } from '../events/events.service';
import { TasksService } from '../tasks/tasks.service';
import { ListsService } from '../lists/lists.service';
import { MealsService } from '../meals/meals.service';

@UseGuards(JwtGuard)
@Controller()
export class AiController {
  constructor(private ai: AiService, private events: EventsService, private tasks: TasksService, private lists: ListsService, private meals: MealsService) {}

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
    for (const a of result.actions || []) {
      if (a.type === 'suggest') continue; // proposals execute client-side on tap
      if (a.type === 'create_event' && a.start_iso) {
        await this.events.create(u.familyId, u.userId, {
          title: a.title, start: a.start_iso, allDay: a.all_day, type: a.event_type, childId: a.child_id, source: 'assistant',
        });
      } else if (a.type === 'create_task') {
        await this.tasks.create(u.familyId, { title: a.title, due: a.due_iso });
      } else if (a.type === 'add_shop_item' && a.title) {
        await this.lists.create(u.familyId, { title: a.title, list: 'shopping' });
      } else if ((a.type === 'check_shop_item' || a.type === 'remove_shop_item') && a.title) {
        const items = await this.lists.list(u.familyId, { list: 'shopping' });
        const hit = items.find((x) => x.title.toLowerCase() === String(a.title).toLowerCase()) || items.find((x) => x.title.toLowerCase().includes(String(a.title).toLowerCase()));
        if (hit) {
          if (a.type === 'remove_shop_item') await this.lists.remove(u.familyId, hit.id);
          else await this.lists.update(u.familyId, hit.id, { done: true });
        }
      } else if (a.type === 'set_meal' && a.date_iso) {
        await this.meals.upsert(u.familyId, { date: a.date_iso, slot: 'dinner', title: a.title || '' });
      }
    }
    return result;
  }
}
