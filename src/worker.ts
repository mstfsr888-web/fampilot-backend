import 'dotenv/config';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { connection, REMINDERS_QUEUE } from './queue';
import { sendPush } from './push';

const prisma = new PrismaClient();

// Processes delayed reminder jobs and delivers the push notification.
const worker = new Worker(
  REMINDERS_QUEUE,
  async (job) => {
    const { reminderId } = job.data as { reminderId: string };
    const r = await prisma.reminder.findUnique({ where: { id: reminderId }, include: { event: true, task: true } });
    if (!r || r.state !== 'scheduled') return;
    const title = r.event ? r.event.title : r.task?.title || 'Reminder';
    const user = r.targetUserId ? await prisma.user.findUnique({ where: { id: r.targetUserId } }) : null;
    await sendPush(user?.pushToken || null, 'FamPilot reminder', title);
    await prisma.reminder.update({ where: { id: r.id }, data: { state: 'sent' } });
  },
  { connection: connection as any },
);

worker.on('completed', (job) => console.log(`[worker] reminder ${job.id} sent`));
worker.on('failed', (job, err) => console.error(`[worker] reminder ${job?.id} failed`, err));
console.log('FamPilot reminders worker started.');
