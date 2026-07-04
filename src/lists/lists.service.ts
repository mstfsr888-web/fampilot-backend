import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';

@Injectable()
export class ListsService {
  constructor(private prisma: PrismaService) {}

  list(familyId: string, q: { list?: string }) {
    const where: any = { familyId };
    if (q.list) where.list = q.list;
    return this.prisma.listItem.findMany({ where, orderBy: { createdAt: 'asc' } });
  }

  create(familyId: string, body: any) {
    return this.prisma.listItem.create({
      data: { id: body.id || newId('itm'), familyId, list: body.list || 'shopping', title: String(body.title || '').slice(0, 200), done: !!body.done },
    });
  }

  async update(familyId: string, id: string, body: any) {
    const data: any = {};
    if (body.title !== undefined) data.title = String(body.title).slice(0, 200);
    if (body.done !== undefined) data.done = !!body.done;
    if (body.list !== undefined) data.list = body.list;
    await this.prisma.listItem.updateMany({ where: { id, familyId }, data });
    return this.prisma.listItem.findFirst({ where: { id, familyId } });
  }

  async remove(familyId: string, id: string) {
    await this.prisma.listItem.deleteMany({ where: { id, familyId } });
    return { ok: true };
  }

  async clearDone(familyId: string, list: string) {
    await this.prisma.listItem.deleteMany({ where: { familyId, list, done: true } });
    return { ok: true };
  }
}
