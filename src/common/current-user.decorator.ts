import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './jwt.guard';

export const CurrentUser = createParamDecorator(
  (_data, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
