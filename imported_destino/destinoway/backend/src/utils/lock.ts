import { randomUUID } from 'node:crypto';
import { redis } from '../config/redis';

const RELEASE = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;
/** Distributed lock (single Redis SET NX PX). Returns a release fn, or null if someone else holds it. */
export async function acquireLock(key: string, ttlMs = 60_000): Promise<null | (() => Promise<void>)> {
  const token = randomUUID();
  const ok = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
  if (ok !== 'OK') return null;
  return async () => { await redis.eval(RELEASE, 1, `lock:${key}`, token); };
}
