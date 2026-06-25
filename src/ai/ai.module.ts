import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { EventsModule } from '../events/events.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({ imports: [EventsModule, TasksModule], controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}
