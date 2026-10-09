import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import type { RequestHandler } from 'express';
import { redis } from '../config/redis';
import { tooMany } from '../utils/errors';
import { securityEvents } from '../observability/metrics';
import { isTest } from '../config/env';

export type Tier = 'ipGlobal' | 'anonymous' | 'authenticated' | 'ai' | 'search' | 'booking' | 'admin' | 'authSensitive' | 'highRisk';
const CONF: Record<Tier, { points: number; duration: number; block?: number }> = {
  ipGlobal: { points: 600, duration: 60 }, // coarse per-IP flood guard (offices/NAT share IPs, so keep generous)
  anonymous: { points: 60, duration: 60 },
  authenticated: { points: 300, duration: 60 },
  ai: { points: 20, duration: 60 },
  search: { points: 30, duration: 60 },
  booking: { points: 5, duration: 60, block: 300 },
  admin: { points: 120, duration: 60 },
  authSensitive: { points: 20, duration: 900, block: 900 }, // login / reset / register: brute-force protection
  highRisk: { points: 3, duration: 300, block: 900 },
};

const limiters = new Map<Tier, RateLimiterRedis | RateLimiterMemory>();
function get(tier: Tier) {
  let l = limiters.get(tier);
  if (!l) {
    const c = CONF[tier];
    const opts = { points: c.points, duration: c.duration, blockDuration: c.block ?? 0, keyPrefix: `rl:${tier}` };
    l = isTest ? new RateLimiterMemory(opts) : new RateLimiterRedis({ ...opts, storeClient: redis, insuranceLimiter: new RateLimiterMemory(opts) });
    limiters.set(tier, l);
  }
  return l;
}

/** key = user id if authenticated, otherwise IP (+ optional extra such as the email being attacked). */
export const rateLimit = (tier: Tier, extraKey?: (req: Parameters<RequestHandler>[0]) => string | undefined): RequestHandler => async (req, res, next) => {
  let key: string;
  try { key = [req.auth?.userId ?? req.ip, extraKey?.(req)].filter(Boolean).join(':'); } catch { key = String(req.ip); } // a throwing key function must never hang the request
  try {
    await get(tier).consume(key);
    return next();
  } catch (rej) {
    if (rej instanceof Error) return next(rej); // store/internal error: fail loudly (500) instead of silently allowing or hanging
    const ms = (rej as { msBeforeNext?: number }).msBeforeNext ?? 1000;
    res.setHeader('Retry-After', Math.ceil(ms / 1000));
    securityEvents.inc({ type: `rate_limited_${tier}` });
    next(tooMany());
  }
};
