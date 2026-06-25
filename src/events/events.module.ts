import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { RemindersModule } from '../reminders/reminders.module';

@Module({ imports: [RemindersModule], controllers: [EventsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}
