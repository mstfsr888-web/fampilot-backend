import { Module } from '@nestjs/common';
import { GmailController } from './gmail.controller';
import { GmailService } from './gmail.service';
import { AiModule } from '../ai/ai.module';
import { EventsModule } from '../events/events.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({ imports: [AiModule, EventsModule, TasksModule], controllers: [GmailController], providers: [GmailService] })
export class GmailModule {}
