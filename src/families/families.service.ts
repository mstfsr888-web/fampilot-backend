import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';

@Injectable()
export class FamiliesService {
  constructor(private prisma: PrismaService) {}

  async getMe(familyId: string) {
    return this.prisma.family.findUnique({
      where: { id: familyId },
      include: {
        users: { select: { id: true, name: true, email: true, role: true, color: true, avatarUrl: true } },
        children: true,
      },
    });
  }

  addChild(familyId: string, data: { name: string; dob?: string; school?: string }) {
    return this.prisma.child.create({
      data: {
        id: newId('chl'),
        familyId,
        name: data.name,
        dob: data.dob ? new Date(data.dob) : null,
        school: data.school,
      },
    });
  }

  updateChild(familyId: string, id: string, data: any) {
    return this.prisma.child.updateMany({ where: { id, familyId }, data });
  }

  updateMember(familyId: string, id: string, data: { pushToken?: string; color?: string; role?: any; name?: string }) {
    return this.prisma.user.updateMany({ where: { id, familyId }, data });
  }
}
