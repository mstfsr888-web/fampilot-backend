import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export interface AuthUser { userId: string; familyId: string; }

@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing bearer token');
    try {
      const payload: any = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      if (payload.typ && payload.typ !== 'access') throw new Error('wrong token type');
      req.user = { userId: payload.sub, familyId: payload.fid } as AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
