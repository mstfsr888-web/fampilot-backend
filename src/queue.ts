import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new IORedis(REDIS_URL, {
  // BullMQ requires this to be null.
  maxRetriesPerRequest: null,
  // Railway's private network hostnames (*.railway.internal) resolve over IPv6.
  // family: 0 enables dual-stack DNS lookup (IPv4 + IPv6) so ioredis can connect.
  // NOTE: setting it here is reliable; the "?family=0" URL trick is NOT.
  family: 0,
});

// Without an 'error' listener, ioredis prints "[ioredis] Unhandled error event"
// on every failed connection attempt and floods the logs. Handle it so the logs
// stay readable and the API can still boot and serve /api/v1/health.
connection.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[redis]', err.message);
});

export const REMINDERS_QUEUE = 'reminders';
export const remindersQueue = new Queue(REMINDERS_QUEUE, { connection: connection as any });
