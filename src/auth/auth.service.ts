import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';
import { signTokens, MEMBER_COLORS } from '../common/tokens';
import { SignupDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already registered');

    const family = await this.prisma.family.create({
      data: {
        id: newId('fam'),
        name: dto.familyName,
        timezone: dto.timezone || 'UTC',
        locale: dto.locale || 'en',
      },
    });
    const user = await this.prisma.user.create({
      data: {
        id: newId('usr'),
        familyId: family.id,
        name: dto.name,
        email: dto.email,
        role: 'parent',
        color: MEMBER_COLORS[0],
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });
    return { ...signTokens(user.id, family.id), user: this.publicUser(user), family };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return { ...signTokens(user.id, user.familyId), user: this.publicUser(user) };
  }

  async refresh(refreshToken: string) {
    try {
      const p: any = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret');
      if (p.typ !== 'refresh') throw new Error('wrong type');
      return signTokens(p.sub, p.fid);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  publicUser(u: any) {
    const { passwordHash, ...rest } = u;
    return rest;
  }
}
