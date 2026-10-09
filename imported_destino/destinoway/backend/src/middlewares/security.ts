import type { RequestHandler } from 'express';
import { allowedOrigins, isProd } from '../config/env';
import { forbidden } from '../utils/errors';
import { securityEvents } from '../observability/metrics';

/**
 * CSRF defence for cookie-authenticated APIs (defence in depth):
 *  1. SameSite=Lax cookies   2. Origin/Referer must be our frontend   3. custom header that browsers will not send cross-site without CORS preflight.
 * Bearer-token API clients (no cookies) are exempt.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  const origin = req.headers.origin ?? (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
  if (!origin || !allowedOrigins.includes(origin) || req.headers['x-requested-with'] !== 'destinoway') {
    securityEvents.inc({ type: 'csrf_blocked' });
    return next(forbidden('Cross-site request blocked', 'CSRF'));
  }
  next();
};

/** Strip Mongo operator keys ($where, $ne ...) and dotted keys from every request payload (NoSQL injection). */
function clean(v: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor') continue;
      out[k] = clean(val, depth + 1);
    }
    return out;
  }
  return v;
}
export const sanitizeInput: RequestHandler = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) for (const k of Object.keys(req.query)) if (k.startsWith('$') || k.includes('.')) delete (req.query as Record<string, unknown>)[k];
  next();
};

export const cookieOptions = (maxAgeMs: number, path = '/') => ({
  httpOnly: true, secure: isProd, sameSite: 'lax' as const, path, maxAge: maxAgeMs,
});
