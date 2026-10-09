import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../observability/logger';

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, enableReadyCheck: true });
redis.on('error', (err) => logger.error({ err: err.message }, 'redis error'));

/** BullMQ / pub-sub need dedicated connections. */
export const createRedisConnection = (forBull = false) =>
  new Redis(env.REDIS_URL, { maxRetriesPerRequest: forBull ? null : 3 });
