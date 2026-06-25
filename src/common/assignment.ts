import { PrismaService } from '../prisma/prisma.service';

export interface AssignItem { type?: string; childId?: string | null; start?: Date | null; }

// Deterministic-first owner suggestion: load-balancing + affinity (+ keeps it explainable).
export async function suggestOwner(
  prisma: PrismaService,
  familyId: string,
  item: AssignItem,
): Promise<{ ownerId: string | null; reason: string }> {
  const parents = await prisma.user.findMany({
    where: { familyId, role: { in: ['parent', 'caregiver'] } },
  });
  if (parents.length === 0) return { ownerId: null, reason: 'no parents' };
  if (parents.length === 1) return { ownerId: parents[0].id, reason: 'only parent' };

  const now = new Date();
  const wk = new Date(now.getTime() + 7 * 864e5);
  const scored = await Promise.all(
    parents.map(async (p) => {
      const ev = await prisma.event.count({ where: { ownerId: p.id, startTime: { gte: now, lt: wk } } });
      const tk = await prisma.task.count({ where: { assigneeId: p.id, status: { not: 'done' } } });
      const aff = await prisma.event.count({
        where: {
          ownerId: p.id,
          OR: [
            item.type ? { type: item.type as any } : { id: '__none__' },
            item.childId ? { childId: item.childId } : { id: '__none__' },
          ],
        },
      });
      return { id: p.id, load: ev + tk, aff };
    }),
  );

  const maxLoad = Math.max(1, ...scored.map((s) => s.load));
  let best: string | null = null;
  let b1 = -1;
  let b2 = -1;
  let bestAff = 0;
  let lighter = false;
  for (const s of scored) {
    const score = 0.3 * (1 - s.load / maxLoad) + 0.3 * Math.min(s.aff / 3, 1) + 0.4;
    if (score > b1) { b2 = b1; b1 = score; best = s.id; bestAff = s.aff; }
    else if (score > b2) { b2 = score; }
  }
  // Too close to call → leave unassigned (surfaced as "needs an owner").
  if (b1 - b2 < 0.06) return { ownerId: null, reason: 'too close' };
  lighter = scored.some((s) => s.id !== best && s.load > (scored.find((x) => x.id === best)?.load ?? 0));
  const reason = bestAff >= 2 ? 'usually handles this' : lighter ? 'lighter week' : 'available';
  return { ownerId: best, reason };
}
