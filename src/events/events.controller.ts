import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { EventsService } from './events.service';

@UseGuards(JwtGuard)
@Controller('events')
export class EventsController {
  constructor(private events: EventsService) {}

  @Get() list(@CurrentUser() u, @Query() q) { return this.events.list(u.familyId, q); }
  @Post() create(@CurrentUser() u, @Body() body) { return this.events.create(u.familyId, u.userId, body); }
  @Get(':id') get(@CurrentUser() u, @Param('id') id) { return this.events.get(u.familyId, id); }
  @Patch(':id') update(@CurrentUser() u, @Param('id') id, @Body() body) { return this.events.update(u.familyId, id, body); }
  @Delete(':id') remove(@CurrentUser() u, @Param('id') id) { return this.events.remove(u.familyId, id); }
}
