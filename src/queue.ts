import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  family: 0,
  lazyConnect: true,
});

connection.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[redis]', err.message);
});

export const REMINDERS_QUEUE = 'reminders';
export const remindersQueue = new Queue(REMINDERS_QUEUE, { connection: connection as any });
