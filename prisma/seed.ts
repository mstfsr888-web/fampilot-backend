import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

const prisma = new PrismaClient();
const id = (p: string) => `${p}_${ulid()}`;

async function main() {
  const fam = await prisma.family.create({ data: { id: id('fam'), name: 'Demo family', timezone: 'Europe/Istanbul' } });
  const ayse = await prisma.user.create({ data: { id: id('usr'), familyId: fam.id, name: 'Ayşe', email: 'ayse@example.com', role: 'parent', color: '#E8765A', passwordHash: await bcrypt.hash('password', 10) } });
  await prisma.user.create({ data: { id: id('usr'), familyId: fam.id, name: 'Mert', email: 'mert@example.com', role: 'parent', color: '#4C82D8', passwordHash: await bcrypt.hash('password', 10) } });
  const deniz = await prisma.child.create({ data: { id: id('chl'), familyId: fam.id, name: 'Deniz' } });
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(15, 0, 0, 0);
  await prisma.event.create({ data: { id: id('evt'), familyId: fam.id, title: 'Dentist', startTime: tomorrow, type: 'health', childId: deniz.id, ownerId: ayse.id, reminderOffsetMin: 1440 } });
  await prisma.task.create({ data: { id: id('tsk'), familyId: fam.id, title: 'Buy costume', dueDate: tomorrow, assigneeId: ayse.id, suggested: true, suggestedReason: 'lighter week' } });
  console.log('Seeded demo family. Login: ayse@example.com / password');
}
main().finally(() => prisma.$disconnect());
