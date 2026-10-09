import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import type { Role } from '../security/rbac';

const ISS = 'destinoway';
const AUD = 'destinoway-web';

export interface AccessClaims { sub: string; sid: string; role: Role; ev: boolean; exp: number }

export function signAccessToken(p: { userId: string; sessionId: string; role: Role; emailVerified: boolean }): string {
  return jwt.sign({ sid: p.sessionId, role: p.role, ev: p.emailVerified }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256', subject: p.userId, issuer: ISS, audience: AUD, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, jwtid: randomUUID(),
  });
}

/** Pins the algorithm (blocks alg=none / key-confusion attacks) and validates iss/aud/exp. */
export function verifyAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISS, audience: AUD });
  if (typeof decoded === 'string' || !decoded.sub || !decoded['sid'] || !decoded['role']) throw new Error('malformed token');
  return decoded as unknown as AccessClaims;
}
