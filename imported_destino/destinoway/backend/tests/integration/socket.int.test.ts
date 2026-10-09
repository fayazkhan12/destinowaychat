import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { registerAndLogin, startServer } from './helpers';
vi.mock('../../src/notifications/mailer', async () => { const h = await import('./helpers'); return { sendMail: async (m: { to: string; subject: string; text: string }) => { h.mails.push(m); } }; });

let s: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { s = await startServer(); });
afterAll(async () => { await s.stop(); const { disconnectMongo } = await import('../../src/config/database'); await disconnectMongo(); (await import('../../src/config/redis')).redis.disconnect(); });

const open = (cookie?: string, origin = 'http://localhost:3000') =>
  new Promise<{ sock: Socket; err?: Error }>((resolve) => {
    const sock = connect(s.origin, { transports: ['websocket'], reconnection: false, extraHeaders: { ...(cookie ? { cookie } : {}), origin } });
    sock.on('connect', () => resolve({ sock }));
    sock.on('connect_error', (err) => { sock.close(); resolve({ sock, err }); });
  });
const collect = (sock: Socket, events: string[]) => { const got: Array<{ ev: string; data: any }> = []; for (const ev of events) sock.on(ev, (data) => got.push({ ev, data })); return got; }; // eslint-disable-line @typescript-eslint/no-explicit-any
const ack = (sock: Socket, payload: unknown) => new Promise<any>((r) => sock.emit('chat:send', payload, r)); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('Socket.IO gateway (cookie-authenticated realtime chat)', () => {
  it('rejects unauthenticated and wrong-origin connections', async () => {
    expect((await open()).err?.message).toBe('unauthenticated');
    const { c } = await registerAndLogin(s.base);
    expect((await open(c.cookieHeader(), 'https://evil.example')).err?.message).toBe('origin_not_allowed');
    expect((await open('dw_at=garbage')).err?.message).toBe('unauthenticated');
  });

  it('streams progress → tokens → trip state → done, and persists the trip', async () => {
    const { c } = await registerAndLogin(s.base);
    const { sock, err } = await open(c.cookieHeader()); expect(err).toBeUndefined();
    const got = collect(sock, ['chat:start', 'chat:progress', 'chat:token', 'trip:state', 'chat:done', 'chat:error']);
    const r = await ack(sock, { text: 'Jaipur se Goa kal ki sasti flight dikhao' });
    expect(r.ok).toBe(true);
    const order = got.map((g) => g.ev);
    expect(order[0]).toBe('chat:start'); expect(order).toContain('chat:progress'); expect(order).toContain('chat:token');
    expect(order.indexOf('trip:state')).toBeLessThan(order.indexOf('chat:done'));
    const progress = got.filter((g) => g.ev === 'chat:progress').map((g) => g.data.status);
    expect(progress).toEqual(expect.arrayContaining(['start', 'done']));
    const streamed = got.filter((g) => g.ev === 'chat:token').map((g) => g.data.text).join('');
    const done = got.find((g) => g.ev === 'chat:done')!.data;
    expect(streamed.trim()).toBe(done.text.trim()); // what was streamed == final text
    const state = got.find((g) => g.ev === 'trip:state')!.data.state;
    expect(state.flights.shortlist.length).toBeGreaterThan(0); expect(JSON.stringify(state)).not.toMatch(/providerRef/);
    expect((await c.get(`/trips/${done.tripId}`)).body.messages.length).toBe(2);
    sock.close();
  });

  it('validates payloads and rate-limits abusive clients', async () => {
    const { c } = await registerAndLogin(s.base);
    const { sock } = await open(c.cookieHeader());
    expect((await ack(sock, { text: '' })).code).toBe('VALIDATION_ERROR');
    expect((await ack(sock, { text: 'hi', extra: 1 })).code).toBe('VALIDATION_ERROR');
    expect((await ack(sock, 'not-an-object')).code).toBe('VALIDATION_ERROR');
    const results: string[] = [];
    for (let i = 0; i < 24; i++) results.push((await ack(sock, { text: 'hi' })).code ?? 'ok');
    expect(results).toContain('RATE_LIMITED');
    sock.close();
  });

  it("revoking the session disconnects the live socket on the next event", async () => {
    const { c } = await registerAndLogin(s.base);
    const { sock } = await open(c.cookieHeader());
    const closed = new Promise<string>((r) => sock.on('disconnect', r));
    await c.post('/auth/logout');
    sock.emit('chat:send', { text: 'hello' });
    expect(await closed).toBeTruthy();
  });

  it("a user cannot post into someone else's trip over the socket", async () => {
    const a = await registerAndLogin(s.base); const b = await registerAndLogin(s.base);
    const t = await a.c.post('/chat/messages', { text: 'Jaipur to Goa flight tomorrow' });
    const { sock } = await open(b.c.cookieHeader());
    const errs = collect(sock, ['chat:error']);
    expect((await ack(sock, { text: 'hi', tripId: t.body.tripId })).ok).toBe(false);
    expect(errs[0]?.data.code).toBe('NOT_FOUND');
    sock.close();
  });
});
