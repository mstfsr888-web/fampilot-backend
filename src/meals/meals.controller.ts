import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MealsService } from './meals.service';

@UseGuards(JwtGuard)
@Controller('meals')
export class MealsController {
  constructor(private meals: MealsService) {}

  @Get() list(@CurrentUser() u, @Query() q) { return this.meals.list(u.familyId, q); }
  @Post() upsert(@CurrentUser() u, @Body() body) { return this.meals.upsert(u.familyId, body); }
  @Delete(':id') remove(@CurrentUser() u, @Param('id') id) { return this.meals.remove(u.familyId, id); }
}
