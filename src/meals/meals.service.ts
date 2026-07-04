import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';

@Injectable()
export class MealsService {
  constructor(private prisma: PrismaService) {}

  list(familyId: string, q: { from?: string; to?: string }) {
    const where: any = { familyId };
    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = new Date(q.from);
      if (q.to) where.date.lt = new Date(q.to);
    }
    return this.prisma.meal.findMany({ where, orderBy: { date: 'asc' } });
  }

  async upsert(familyId: string, body: any) {
    // one meal per family+date+slot: replace if exists
    const date = new Date(body.date);
    const slot = body.slot || 'dinner';
    const existing = await this.prisma.meal.findFirst({ where: { familyId, date, slot } });
    const title = String(body.title || '').slice(0, 200);
    if (!title) {
      if (existing) await this.prisma.meal.delete({ where: { id: existing.id } });
      return { ok: true, removed: true };
    }
    if (existing) return this.prisma.meal.update({ where: { id: existing.id }, data: { title } });
    return this.prisma.meal.create({ data: { id: body.id || newId('meal'), familyId, date, slot, title } });
  }

  async remove(familyId: string, id: string) {
    await this.prisma.meal.deleteMany({ where: { id, familyId } });
    return { ok: true };
  }
}
