import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
export const REMINDERS_QUEUE = 'reminders';
export const remindersQueue = new Queue(REMINDERS_QUEUE, { connection: connection as any });
