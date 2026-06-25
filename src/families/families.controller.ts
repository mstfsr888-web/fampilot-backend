import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { FamiliesService } from './families.service';

@UseGuards(JwtGuard)
@Controller()
export class FamiliesController {
  constructor(private fam: FamiliesService) {}

  @Get('families/me')
  me(@CurrentUser() u) { return this.fam.getMe(u.familyId); }

  @Post('families/me/children')
  addChild(@CurrentUser() u, @Body() body) { return this.fam.addChild(u.familyId, body); }

  @Patch('children/:id')
  updateChild(@CurrentUser() u, @Param('id') id, @Body() body) { return this.fam.updateChild(u.familyId, id, body); }

  @Patch('members/:id')
  updateMember(@CurrentUser() u, @Param('id') id, @Body() body) { return this.fam.updateMember(u.familyId, id, body); }
}
