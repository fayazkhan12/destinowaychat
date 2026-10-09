import { randomUUID } from 'node:crypto';
import { trusted } from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../auth/password';
import { signAccessToken } from '../auth/tokens';
import { sessionStore } from '../auth/sessionStore';
import { userRepository } from '../repositories/userRepository';
import { sessionRepository } from '../repositories/sessionRepository';
import { auditRepository } from '../repositories/auditRepository';
import { AuthToken } from '../models/AuthToken';
import { emailQueue } from '../workers/queues';
import { hmacToken, randomToken, safeEqual } from '../utils/crypto';
import { AppError, badRequest, unauthorized } from '../utils/errors';
import { securityEvents } from '../observability/metrics';
import type { UserDoc } from '../models/User';
import type { Role } from '../security/rbac';

export interface ClientInfo { ip?: string; userAgent?: string }
export interface IssuedAuth { accessToken: string; refreshCookie: string; refreshExpiresAt: Date; user: PublicUser; sessionId: string }
export interface PublicUser { id: string; email: string; name: string; role: Role; emailVerified: boolean }

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const REUSE_GRACE_MS = 10_000;

const toPublic = (u: UserDoc): PublicUser => ({ id: String(u._id), email: u.email, name: u.name, role: u.role as Role, emailVerified: u.emailVerified });

function parseUA(ua = '') {
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome\//i.test(ua) ? 'Chrome' : /firefox\//i.test(ua) ? 'Firefox' : /safari\//i.test(ua) ? 'Safari' : 'Unknown';
  const device = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Unknown';
  return { browser, device };
}

async function issueSession(user: UserDoc, client: ClientInfo): Promise<IssuedAuth> {
  const sessionId = randomUUID();
  const secret = randomToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const { browser, device } = parseUA(client.userAgent);
  await sessionRepository.create({ sessionId, userId: user._id, refreshHash: hmacToken(secret), device, browser, ip: client.ip, expiresAt, metadata: { ua: client.userAgent?.slice(0, 200) } });
  await sessionStore.markActive(sessionId, expiresAt);
  const accessToken = signAccessToken({ userId: String(user._id), sessionId, role: user.role as Role, emailVerified: user.emailVerified });
  return { accessToken, refreshCookie: `${sessionId}.${secret}`, refreshExpiresAt: expiresAt, user: toPublic(user), sessionId };
}

async function sendToken(user: UserDoc, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET') {
  const raw = randomToken(32);
  const ttl = type === 'EMAIL_VERIFY' ? 24 * 3600_000 : 30 * 60_000;
  await AuthToken.create({ userId: user._id, type, tokenHash: hmacToken(raw), expiresAt: new Date(Date.now() + ttl) });
  const path = type === 'EMAIL_VERIFY' ? 'verify-email' : 'reset-password';
  const link = `${env.FRONTEND_ORIGIN}/${path}?token=${raw}`;
  await emailQueue.add('send', type === 'EMAIL_VERIFY'
    ? { to: user.email, subject: 'Verify your Destinoway email', text: `Welcome to Destinoway!\n\nVerify your email: ${link}\n\nThis link expires in 24 hours.` }
    : { to: user.email, subject: 'Reset your Destinoway password', text: `Reset your password: ${link}\n\nThis link expires in 30 minutes. If you did not ask for this, ignore this email.` });
}

async function consumeToken(raw: string, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET') {
  const doc = await AuthToken.findOneAndUpdate(
    { tokenHash: hmacToken(raw), type, usedAt: null, expiresAt: trusted({ $gt: new Date() }) },
    { $set: { usedAt: new Date() } },
  ); // atomic: a token can be used once, even under concurrent requests
  if (!doc) throw badRequest('This link is invalid or has expired', 'TOKEN_INVALID');
  return doc;
}

export const authService = {
  async register(input: { name: string; email: string; password: string }, client: ClientInfo) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      // Do not reveal whether the email exists. Same response as success.
      await auditRepository.record({ action: 'AUTH_REGISTER', outcome: 'DENIED', ip: client.ip, metadata: { reason: 'duplicate' } });
      return;
    }
    const user = await userRepository.create({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password), passwordChangedAt: new Date() });
    await sendToken(user as unknown as UserDoc, 'EMAIL_VERIFY');
    await auditRepository.record({ action: 'AUTH_REGISTER', outcome: 'SUCCESS', actorId: String(user._id), actorRole: 'USER', ip: client.ip });
  },

  async login(input: { email: string; password: string }, client: ClientInfo): Promise<IssuedAuth> {
    const user = await userRepository.findByEmail(input.email);
    const generic = unauthorized('Invalid email or password, or the account is temporarily locked', 'INVALID_CREDENTIALS');
    if (!user || !user.passwordHash) {
      await verifyPassword(input.password, DUMMY_HASH); // equalise timing
      await auditRepository.record({ action: 'AUTH_LOGIN', outcome: 'FAILURE', ip: client.ip, metadata: { reason: 'unknown_user' } });
      throw generic;
    }
    const uid = String(user._id);
    if (user.disabledAt || (user.lockedUntil && user.lockedUntil > new Date())) {
      securityEvents.inc({ type: 'login_while_locked' });
      await auditRepository.record({ action: 'AUTH_LOGIN', outcome: 'DENIED', actorId: uid, ip: client.ip, metadata: { reason: user.disabledAt ? 'disabled' : 'locked' } });
      throw generic;
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      const failed = (user.failedLoginCount ?? 0) + 1;
      const lock = failed >= MAX_FAILED;
      await user.updateOne({ $set: { failedLoginCount: lock ? 0 : failed, ...(lock ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : {}) } });
      if (lock) securityEvents.inc({ type: 'account_locked' });
      await auditRepository.record({ action: 'AUTH_LOGIN', outcome: 'FAILURE', actorId: uid, ip: client.ip, metadata: { failed, locked: lock } });
      throw generic;
    }
    await user.updateOne({ $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } });
    const issued = await issueSession(user as unknown as UserDoc, client);
    await auditRepository.record({ action: 'AUTH_LOGIN', outcome: 'SUCCESS', actorId: uid, actorRole: user.role, ip: client.ip, targetType: 'session', targetId: issued.sessionId });
    return issued;
  },

  /** Refresh-token rotation with reuse detection (stolen-token defence). Cookie format: <sessionId>.<secret> */
  async refresh(cookie: string | undefined, client: ClientInfo): Promise<IssuedAuth> {
    const bad = unauthorized('Session expired. Please sign in again.', 'SESSION_EXPIRED');
    if (!cookie) throw bad;
    const dot = cookie.indexOf('.');
    if (dot < 1) throw bad;
    const sessionId = cookie.slice(0, dot);
    const secret = cookie.slice(dot + 1);
    const session = await sessionRepository.findBySessionId(sessionId);
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw bad;
    const presented = hmacToken(secret);
    const current = session.refreshHash;
    const previous = session.previousRefreshHash;

    if (!safeEqual(presented, current)) {
      if (previous && safeEqual(presented, previous)) {
        if (session.rotatedAt && Date.now() - session.rotatedAt.getTime() < REUSE_GRACE_MS) {
          throw new AppError(409, 'REFRESH_RACE', 'Concurrent refresh, retry'); // benign race between tabs
        }
        // An old token was replayed -> assume theft, kill the whole session.
        await sessionRepository.revoke(sessionId, 'REFRESH_REUSE_DETECTED');
        await sessionStore.markRevoked([sessionId]);
        securityEvents.inc({ type: 'refresh_reuse' });
        await auditRepository.record({ action: 'AUTH_REFRESH_REUSE_DETECTED', outcome: 'DENIED', actorId: String(session.userId), ip: client.ip, targetId: sessionId });
      }
      throw bad;
    }
    const user = await userRepository.findById(String(session.userId));
    if (!user || user.disabledAt) throw bad;
    const newSecret = randomToken();
    await session.updateOne({ $set: { refreshHash: hmacToken(newSecret), previousRefreshHash: current, rotatedAt: new Date(), lastActiveAt: new Date(), ip: client.ip ?? session.ip } });
    await sessionStore.markActive(sessionId, session.expiresAt);
    const accessToken = signAccessToken({ userId: String(user._id), sessionId, role: user.role as Role, emailVerified: user.emailVerified });
    return { accessToken, refreshCookie: `${sessionId}.${newSecret}`, refreshExpiresAt: session.expiresAt, user: toPublic(user as unknown as UserDoc), sessionId };
  },

  async logout(auth: { userId: string; sessionId: string; role?: string }, ip?: string) {
    await sessionRepository.revoke(auth.sessionId, 'LOGOUT');
    await sessionStore.markRevoked([auth.sessionId]);
    await auditRepository.record({ action: 'AUTH_LOGOUT', outcome: 'SUCCESS', actorId: auth.userId, actorRole: auth.role, ip, targetId: auth.sessionId });
  },
  async logoutAll(auth: { userId: string; role?: string }, ip?: string) {
    const sids = await sessionRepository.revokeAllForUser(auth.userId, 'LOGOUT_ALL');
    await sessionStore.markRevoked(sids);
    await auditRepository.record({ action: 'AUTH_LOGOUT_ALL', outcome: 'SUCCESS', actorId: auth.userId, actorRole: auth.role, ip, metadata: { count: sids.length } });
  },
  async revokeOwnSession(userId: string, sessionId: string, ip?: string) {
    const s = await sessionRepository.findBySessionId(sessionId);
    if (!s || String(s.userId) !== userId) throw new AppError(404, 'NOT_FOUND', 'Session not found');
    await sessionRepository.revoke(sessionId, 'USER_REVOKED');
    await sessionStore.markRevoked([sessionId]);
    await auditRepository.record({ action: 'SESSION_REVOKED', outcome: 'SUCCESS', actorId: userId, ip, targetId: sessionId });
  },
  listSessions: (userId: string) => sessionRepository.listActiveForUser(userId),

  async verifyEmail(token: string) {
    const t = await consumeToken(token, 'EMAIL_VERIFY');
    await userRepository.findById(String(t.userId)).then((u) => u?.updateOne({ $set: { emailVerified: true } }));
    await auditRepository.record({ action: 'EMAIL_VERIFIED', outcome: 'SUCCESS', actorId: String(t.userId) });
  },
  async resendVerification(userId: string) {
    const u = await userRepository.findById(userId);
    if (u && !u.emailVerified) await sendToken(u as unknown as UserDoc, 'EMAIL_VERIFY');
  },
  async forgotPassword(email: string, client: ClientInfo) {
    const u = await userRepository.findByEmail(email);
    if (u && !u.disabledAt) await sendToken(u as unknown as UserDoc, 'PASSWORD_RESET');
    await auditRepository.record({ action: 'PASSWORD_RESET_REQUESTED', outcome: 'SUCCESS', ip: client.ip, actorId: u ? String(u._id) : undefined }); // same response either way
  },
  async resetPassword(token: string, password: string, client: ClientInfo) {
    const t = await consumeToken(token, 'PASSWORD_RESET');
    const uid = String(t.userId);
    const hash = await hashPassword(password);
    const u = await userRepository.findById(uid);
    if (!u) throw badRequest('Invalid token', 'TOKEN_INVALID');
    await u.updateOne({ $set: { passwordHash: hash, passwordChangedAt: new Date(), failedLoginCount: 0 }, $unset: { lockedUntil: 1 } });
    const sids = await sessionRepository.revokeAllForUser(uid, 'PASSWORD_RESET'); // kick every device
    await sessionStore.markRevoked(sids);
    await auditRepository.record({ action: 'PASSWORD_CHANGED', outcome: 'SUCCESS', actorId: uid, ip: client.ip, metadata: { via: 'reset' } });
  },

  // ---- Google OAuth (authorization-code flow, server-side) ----
  googleClient(): OAuth2Client {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) throw new AppError(501, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured');
    return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
  },
  async googleLogin(code: string, client: ClientInfo): Promise<IssuedAuth> {
    const oauth = this.googleClient();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token) throw unauthorized('Google sign-in failed', 'GOOGLE_FAILED');
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.email || !p.email_verified || !p.sub) throw unauthorized('Google account email is not verified', 'GOOGLE_EMAIL_UNVERIFIED');
    let user = await userRepository.findByGoogleId(p.sub);
    if (!user) {
      const byEmail = await userRepository.findByEmail(p.email);
      if (byEmail) {
        if (byEmail.disabledAt) throw unauthorized('Account disabled', 'ACCOUNT_DISABLED');
        await byEmail.updateOne({ $set: { googleId: p.sub, emailVerified: true } }); // Google verified the email -> safe to link
        user = await userRepository.findById(String(byEmail._id));
      } else {
        user = await userRepository.create({ email: p.email, name: p.name ?? p.email.split('@')[0], googleId: p.sub, emailVerified: true });
      }
    }
    if (!user || user.disabledAt) throw unauthorized('Account disabled', 'ACCOUNT_DISABLED');
    await user.updateOne({ $set: { lastLoginAt: new Date() } });
    const issued = await issueSession(user as unknown as UserDoc, client);
    await auditRepository.record({ action: 'AUTH_LOGIN_GOOGLE', outcome: 'SUCCESS', actorId: String(user._id), actorRole: user.role, ip: client.ip });
    return issued;
  },
};
