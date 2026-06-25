import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';
import { signTokens, MEMBER_COLORS } from '../common/tokens';

@Injectable()
export class InvitesService {
  constructor(private prisma: PrismaService) {}

  async create(familyId: string, invitedBy: string, body: { email?: string; role?: any }) {
    const token = ulid();
    const invite = await this.prisma.invite.create({
      data: {
        id: newId('inv'),
        familyId,
        token,
        email: body.email,
        role: body.role || 'parent',
        invitedBy,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    const base = process.env.APP_INVITE_BASE_URL || 'https://app.fampilot.example/join';
    return { invite, url: `${base}?token=${token}` };
  }

  list(familyId: string) {
    return this.prisma.invite.findMany({ where: { familyId, acceptedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  async accept(body: { token: string; name: string; email: string; password: string }) {
    const invite = await this.prisma.invite.findUnique({ where: { token: body.token } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.acceptedAt) throw new BadRequestException('Invite already used');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite expired');

    const exists = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new BadRequestException('Email already registered');

    const count = await this.prisma.user.count({ where: { familyId: invite.familyId } });
    const user = await this.prisma.user.create({
      data: {
        id: newId('usr'),
        familyId: invite.familyId,
        name: body.name,
        email: body.email,
        role: invite.role,
        color: MEMBER_COLORS[count % MEMBER_COLORS.length],
        passwordHash: await bcrypt.hash(body.password, 10),
      },
    });
    await this.prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return { ...signTokens(user.id, invite.familyId), user: { ...user, passwordHash: undefined } };
  }
}
