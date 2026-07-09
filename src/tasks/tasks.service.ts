import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';
import { suggestOwner } from '../common/assignment';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  list(familyId: string, q: { status?: string; assigneeId?: string }) {
    const where: any = { familyId };
    if (q.status) where.status = q.status;
    if (q.assigneeId) where.assigneeId = q.assigneeId;
    return this.prisma.task.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async create(familyId: string, body: any) {
    let assigneeId = body.assigneeId;
    if (assigneeId) {
      const u = await this.prisma.user.findFirst({ where: { id: assigneeId, familyId }, select: { id: true } });
      if (!u) assigneeId = null;
    }
    let suggested = false;
    let suggestedReason: string | undefined;
    if (assigneeId === undefined && body.autoAssign !== false) {
      const s = await suggestOwner(this.prisma, familyId, { childId: body.childId });
      assigneeId = s.ownerId;
      suggested = true;
      suggestedReason = s.reason;
    }
    return this.prisma.task.create({
      data: {
        id: newId('tsk'),
        familyId,
        title: body.title,
        description: body.description,
        dueDate: body.due ? new Date(body.due) : null,
        recur: body.recur || 'none',
        status: body.status || 'todo',
        assigneeId: assigneeId || null,
        suggested,
        suggestedReason,
        linkedEventId: body.linkedEventId || null,
      },
    });
  }

  async update(familyId: string, id: string, body: any) {
    const data: any = { ...body };
    if (body.due !== undefined) data.dueDate = body.due ? new Date(body.due) : null;
    delete data.due; delete data.autoAssign;
    await this.prisma.task.updateMany({ where: { id, familyId }, data });
    return this.prisma.task.findFirst({ where: { id, familyId } });
  }
}
