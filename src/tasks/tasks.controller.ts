import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { TasksService } from './tasks.service';

@UseGuards(JwtGuard)
@Controller('tasks')
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get() list(@CurrentUser() u, @Query() q) { return this.tasks.list(u.familyId, q); }
  @Post() create(@CurrentUser() u, @Body() body) { return this.tasks.create(u.familyId, body); }
  @Patch(':id') update(@CurrentUser() u, @Param('id') id, @Body() body) { return this.tasks.update(u.familyId, id, body); }
}
