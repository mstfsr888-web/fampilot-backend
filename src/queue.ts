import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  // eslint-disable-next-line no-console
  console.warn('[redis] REDIS_URL is not set. API will boot, but reminder scheduling is DISABLED until Redis is configured.');
}

// Single shared ioredis instance. lazyConnect means NO socket is opened here,
// so importing this module can never block application bootstrap.
export const connection = new IORedis(REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
  family: 0,                  // Railway private network resolves over IPv6
  lazyConnect: true,
});

connection.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[redis]', err.message);
});

export const REMINDERS_QUEUE = 'reminders';

// The BullMQ Queue is created LAZILY on first use (first reminder scheduled),
// never at import/module-init time. This guarantees the NestJS app always
// reaches app.listen() and the /api/v1/health healthcheck, even if Redis
// is missing or unreachable.
let _queue: Queue | null = null;
function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(REMINDERS_QUEUE, { connection: connection as any });
  }
  return _queue;
}

// Backwards-compatible export: behaves like a Queue, but only instantiates it
// when a property/method is first accessed.
export const remindersQueue: Queue = new Proxy({} as Queue, {
  get(_target, prop, _receiver) {
    const q = getQueue() as any;
    const value = q[prop];
    return typeof value === 'function' ? value.bind(q) : value;
  },
});
