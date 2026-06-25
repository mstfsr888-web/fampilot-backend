import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { DigestsService } from './digests.service';

@Module({ providers: [RemindersService, DigestsService], exports: [RemindersService] })
export class RemindersModule {}
