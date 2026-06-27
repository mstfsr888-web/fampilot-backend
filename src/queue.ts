import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new IORedis(REDIS_URL, {
  // BullMQ requires this to be null.
  maxRetriesPerRequest: null,
  // Railway's private network (*.railway.internal) resolves over IPv6.
  // family: 0 enables dual-stack DNS lookup so ioredis can connect.
  family: 0,
  // Do NOT open the socket at import time. Connect only on first use.
  // This keeps app bootstrap (and /api/v1/health) fully independent of Redis.
  lazyConnect: true,
});

// Prevent ioredis from spamming "[ioredis] Unhandled error event" and keep logs clean.
connection.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[redis]', err.message);
});

export const REMINDERS_QUEUE = 'reminders';
export const remindersQueue = new Queue(REMINDERS_QUEUE, { connection: connection as any });
