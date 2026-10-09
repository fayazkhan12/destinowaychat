import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client, ORIGIN, PASSWORD, lastLink, registerAndLogin, startServer, uniqueEmail, waitFor, mails } from './helpers';
vi.mock('../../src/notifications/mailer', async () => { const h = await import('./helpers'); return { sendMail: async (m: { to: string; subject: string; text: string }) => { h.mails.push(m); } }; });

let s: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { s = await startServer(); });
afterAll(async () => { await s.stop(); const { disconnectMongo } = await import('../../src/config/database'); await disconnectMongo(); (await import('../../src/config/redis')).redis.disconnect(); });

describe('auth lifecycle (real Mongo + Redis)', () => {
  it('registers without revealing duplicates, verifies email, logs in with HttpOnly cookies', async () => {
    const email = uniqueEmail(); const c = new Client(s.base);
    expect((await c.post('/auth/register', { name: 'A', email, password: PASSWORD })).status).toBe(202);
    expect((await c.post('/auth/register', { name: 'A', email, password: PASSWORD })).status).toBe(202); // identical response: no enumeration
    const token = await waitFor(() => { try { return lastLink(email, 'verify-email'); } catch { return undefined; } });
    expect((await c.post('/auth/verify-email', { token })).status).toBe(200);
    expect((await c.post('/auth/verify-email', { token })).status).toBe(400); // single use
    const r = await c.post('/auth/login', { email, password: PASSWORD });
    expect(r.status).toBe(200);
    const sc = r.headers.getSetCookie().join('\n');
    expect(sc).toMatch(/dw_at=.*HttpOnly/i); expect(sc).toMatch(/dw_rt=.*HttpOnly/i); expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/dw_rt=[^\n]*Path=\/api\/v1\/auth;/i); // refresh cookie is scoped to the auth path
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|token/i);
    const me = await c.get('/me'); expect(me.status).toBe(200); expect(me.body.user.email).toBe(email); expect(me.body.user.emailVerified).toBe(true);
  });

  it('rejects wrong password generically and locks the account after 5 failures', async () => {
    const { c, email } = await registerAndLogin(s.base);
    const anon = new Client(s.base, { 'x-forwarded-for': '10.9.9.9' });
    for (let i = 0; i < 5; i++) { const r = await anon.post('/auth/login', { email, password: 'wrong-password-1' }); expect([401, 429]).toContain(r.status); }
    const ok = await anon.post('/auth/login', { email, password: PASSWORD });
    expect([401, 429]).toContain(ok.status); // locked (or rate-limited) even with the right password
    void c;
  });

  it('blocks cross-site state-changing requests (CSRF)', async () => {
    const c = new Client(s.base);
    expect((await c.post('/auth/login', { email: 'a@b.co', password: 'x' }, { csrf: false })).status).toBe(403);
    expect((await c.post('/auth/login', { email: 'a@b.co', password: 'x' }, { csrf: false, headers: { origin: 'https://evil.example', 'x-requested-with': 'destinoway' } })).status).toBe(403);
  });

  it('rotates refresh tokens and kills the session when an old token is replayed (theft detection)', async () => {
    const { c } = await registerAndLogin(s.base);
    const oldRt = c.jar.get('dw_rt')!;
    expect((await c.post('/auth/refresh')).status).toBe(200);
    const newRt = c.jar.get('dw_rt')!; expect(newRt).not.toBe(oldRt);
    // Make the rotation "old" so it is not treated as a benign multi-tab race.
    const sid = oldRt.split('.')[0]!; const { Session } = await import('../../src/models/Session');
    await Session.updateOne({ sessionId: sid }, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    const attacker = new Client(s.base); attacker.jar.set('dw_rt', oldRt);
    expect((await attacker.post('/auth/refresh')).status).toBe(401);
    expect((await c.get('/me')).status).toBe(401); // legit user's session is revoked too
    expect((await c.post('/auth/refresh')).status).toBe(401);
  });

  it('tolerates a concurrent refresh race without logging the user out', async () => {
    const { c } = await registerAndLogin(s.base);
    const oldRt = c.jar.get('dw_rt')!;
    expect((await c.post('/auth/refresh')).status).toBe(200);
    const tab2 = new Client(s.base); tab2.jar.set('dw_rt', oldRt);
    expect((await tab2.post('/auth/refresh')).status).toBe(409); // retryable, session intact
    expect((await c.get('/me')).status).toBe(200);
  });

  it('lists devices, revokes one, logout-all revokes everything; revocation is instant', async () => {
    const { c, email } = await registerAndLogin(s.base);
    const second = new Client(s.base); expect((await second.post('/auth/login', { email, password: PASSWORD })).status).toBe(200);
    const list = await c.get('/sessions'); expect(list.body.sessions.length).toBe(2);
    const other = list.body.sessions.find((x: { current: boolean }) => !x.current);
    expect((await c.del(`/sessions/${other.sessionId}`)).status).toBe(204);
    expect((await second.get('/me')).status).toBe(401); // access token still unexpired, but session revoked
    expect((await c.post('/auth/logout-all')).status).toBe(204);
    expect((await c.get('/me')).status).toBe(401);
  });

  it("a user cannot revoke someone else's session", async () => {
    const a = await registerAndLogin(s.base); const b = await registerAndLogin(s.base);
    const bSid = (await b.c.get('/sessions')).body.sessions[0].sessionId;
    expect((await a.c.del(`/sessions/${bSid}`)).status).toBe(404);
    expect((await b.c.get('/me')).status).toBe(200);
  });

  it('password reset is single-use, never reveals account existence, and revokes all sessions', async () => {
    const { c, email } = await registerAndLogin(s.base);
    const anon = new Client(s.base);
    expect((await anon.post('/auth/forgot-password', { email: uniqueEmail('ghost') })).status).toBe(202);
    expect((await anon.post('/auth/forgot-password', { email })).status).toBe(202);
    const token = await waitFor(() => { try { return lastLink(email, 'reset-password'); } catch { return undefined; } });
    expect((await anon.post('/auth/reset-password', { token, password: 'Brand-new-pass-77' })).status).toBe(200);
    expect((await anon.post('/auth/reset-password', { token, password: 'Another-pass-88' })).status).toBe(400);
    expect((await c.get('/me')).status).toBe(401);
    expect((await new Client(s.base).post('/auth/login', { email, password: 'Brand-new-pass-77' })).status).toBe(200);
  });

  it('validates input strictly (mass-assignment, weak password, NoSQL operators)', async () => {
    const c = new Client(s.base);
    expect((await c.post('/auth/register', { name: 'x', email: uniqueEmail(), password: 'short1' })).status).toBe(400);
    expect((await c.post('/auth/register', { name: 'x', email: uniqueEmail(), password: PASSWORD, role: 'SUPER_ADMIN' })).status).toBe(400);
    expect((await c.post('/auth/login', { email: { $ne: null }, password: { $ne: null } })).status).toBe(400);
  });

  it('enforces RBAC on the server', async () => {
    const user = await registerAndLogin(s.base); const admin = await registerAndLogin(s.base, 'ADMIN'); const sa = await registerAndLogin(s.base, 'SUPER_ADMIN');
    expect((await new Client(s.base).get('/admin/users')).status).toBe(401);
    expect((await user.c.get('/admin/users')).status).toBe(403);
    expect((await admin.c.get('/admin/users')).status).toBe(200);
    expect((await admin.c.patch(`/admin/users/${user.user.id}/role`, { role: 'ADMIN' })).status).toBe(403); // ADMIN cannot change roles
    expect((await sa.c.patch(`/admin/users/${user.user.id}/role`, { role: 'SUPPORT_AGENT' })).status).toBe(200);
    expect((await user.c.get('/me')).status).toBe(401); // role change forces re-login
    const audit = await sa.c.get('/admin/audit-logs?limit=100');
    expect(audit.body.logs.some((l: { action: string }) => l.action === 'ROLE_CHANGED')).toBe(true);
    expect(mails.length).toBeGreaterThan(0); void ORIGIN;
  });

  it('audit log is immutable', async () => {
    const { AuditLog } = await import('../../src/models/AuditLog');
    const one = await AuditLog.findOne().lean(); expect(one).toBeTruthy();
    await expect(AuditLog.updateOne({ _id: one!._id }, { $set: { action: 'X' } })).rejects.toThrow(/immutable/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/immutable/);
  });
});
