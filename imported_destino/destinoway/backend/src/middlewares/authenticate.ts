import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../auth/tokens';
import { sessionStore } from '../auth/sessionStore';
import { unauthorized, forbidden } from '../utils/errors';
import { hasPermission, type Permission, type Role } from '../security/rbac';
import { auditRepository } from '../repositories/auditRepository';
import { requestStore } from '../observability/logger';

export const ACCESS_COOKIE = 'dw_at';

export function extractAccessToken(req: { headers: { authorization?: string }; cookies?: Record<string, string> }): string | undefined {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return req.cookies?.[ACCESS_COOKIE];
}

/** Verifies JWT signature/claims AND that the session has not been revoked. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractAccessToken(req);
    if (!token) throw unauthorized();
    let claims;
    try { claims = verifyAccessToken(token); } catch { throw unauthorized('Invalid or expired token', 'TOKEN_INVALID'); }
    if (!(await sessionStore.isActive(claims.sid))) throw unauthorized('Session revoked', 'SESSION_REVOKED');
    req.auth = { userId: claims.sub, sessionId: claims.sid, role: claims.role as Role, emailVerified: Boolean(claims.ev) };
    const store = requestStore.getStore();
    if (store) store.userId = claims.sub;
    next();
  } catch (e) { next(e); }
};

/** Server-side authorization. Never rely on frontend route guards. */
export const requirePermission = (...perms: Permission[]): RequestHandler => async (req, _res, next) => {
  const a = req.auth;
  if (!a) return next(unauthorized());
  const missing = perms.filter((p) => !hasPermission(a.role, p));
  if (missing.length) {
    await auditRepository.record({ action: 'AUTHZ_DENIED', outcome: 'DENIED', actorId: a.userId, actorRole: a.role, ip: req.ip, metadata: { missing, path: req.path } });
    return next(forbidden('You do not have permission to do that'));
  }
  next();
};

export const requireVerifiedEmail: RequestHandler = (req, _res, next) =>
  req.auth?.emailVerified ? next() : next(forbidden('Please verify your email first', 'EMAIL_NOT_VERIFIED'));
