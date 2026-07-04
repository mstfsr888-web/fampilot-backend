import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { IcsController } from './ics.controller';
import { EventsService } from './events.service';
import { RemindersModule } from '../reminders/reminders.module';

@Module({ imports: [RemindersModule], controllers: [EventsController, IcsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}
