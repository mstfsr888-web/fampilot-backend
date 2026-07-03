import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AiService } from './ai.service';
import { EventsService } from '../events/events.service';
import { TasksService } from '../tasks/tasks.service';

@UseGuards(JwtGuard)
@Controller()
export class AiController {
  constructor(private ai: AiService, private events: EventsService, private tasks: TasksService) {}

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
  async chat(@CurrentUser() u, @Body() body: { messages: any[] }) {
    const result = await this.ai.assistant(u.familyId, body.messages || []);
    for (const a of result.actions || []) {
      if (a.type === 'create_event' && a.start_iso) {
        await this.events.create(u.familyId, u.userId, {
          title: a.title, start: a.start_iso, allDay: a.all_day, type: a.event_type, childId: a.child_id, source: 'assistant',
        });
      } else if (a.type === 'create_task') {
        await this.tasks.create(u.familyId, { title: a.title, due: a.due_iso });
      }
    }
    return result;
  }
}
