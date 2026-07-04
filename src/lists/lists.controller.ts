import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ListsService } from './lists.service';

@UseGuards(JwtGuard)
@Controller('lists')
export class ListsController {
  constructor(private lists: ListsService) {}

  @Get() list(@CurrentUser() u, @Query() q) { return this.lists.list(u.familyId, q); }
  @Post() create(@CurrentUser() u, @Body() body) { return this.lists.create(u.familyId, body); }
  @Patch(':id') update(@CurrentUser() u, @Param('id') id, @Body() body) { return this.lists.update(u.familyId, id, body); }
  @Delete(':id') remove(@CurrentUser() u, @Param('id') id) { return this.lists.remove(u.familyId, id); }
  @Post('clear-done') clearDone(@CurrentUser() u, @Body() body) { return this.lists.clearDone(u.familyId, body.list || 'shopping'); }
}
