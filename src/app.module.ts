import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { FamiliesModule } from './families/families.module';
import { InvitesModule } from './invites/invites.module';
import { EventsModule } from './events/events.module';
import { TasksModule } from './tasks/tasks.module';
import { ListsModule } from './lists/lists.module';
import { MealsModule } from './meals/meals.module';
import { RemindersModule } from './reminders/reminders.module';
import { AiModule } from './ai/ai.module';
import { HealthController } from './health.controller';
import { GmailModule } from './gmail/gmail.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    FamiliesModule,
    InvitesModule,
    EventsModule,
    TasksModule,
    ListsModule,
    MealsModule,
    RemindersModule,
    AiModule,
    GmailModule,
  ],
})
export class AppModule {}
