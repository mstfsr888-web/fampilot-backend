import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { EventsModule } from '../events/events.module';
import { TasksModule } from '../tasks/tasks.module';
import { ListsModule } from '../lists/lists.module';
import { MealsModule } from '../meals/meals.module';

@Module({ imports: [EventsModule, TasksModule, ListsModule, MealsModule], controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}
