import http from 'node:http';
import type { AddressInfo } from 'node:net';


export const ORIGIN = 'http://localhost:3000';
export const mails: Array<{ to: string; subject: string; text: string }> = [];
export const lastLink = (to: string, path: string) => {
  const m = [...mails].reverse().find((x) => x.to === to && x.text.includes(path));
  const t = m?.text.match(/token=([\w-]+)/)?.[1];
  if (!t) throw new Error(`no ${path} mail for ${to}`);
  return t;
};

export interface Resp { status: number; body: any; headers: Headers } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Tiny HTTP client with a cookie jar, so tests behave like a browser. */
export class Client {
  jar = new Map<string, string>();
  constructor(public base: string, public headersExtra: Record<string, string> = {}) {
    // each simulated browser gets its own client IP so per-IP production rate limits don't interfere between tests
    if (!this.headersExtra['x-forwarded-for']) this.headersExtra = { ...this.headersExtra, 'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` };
  }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(method: string, path: string, body?: unknown, opts: { csrf?: boolean; headers?: Record<string, string> } = {}): Promise<Resp> {
    const h: Record<string, string> = { 'content-type': 'application/json', ...this.headersExtra, ...opts.headers };
    if (opts.csrf !== false && method !== 'GET') { h['origin'] = ORIGIN; h['x-requested-with'] = 'destinoway'; }
    const c = this.cookieHeader(); if (c) h['cookie'] = c;
    const res = await fetch(this.base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';'); const i = pair!.indexOf('='); const name = pair!.slice(0, i); const val = pair!.slice(i + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(sc) || val === '') this.jar.delete(name); else this.jar.set(name, val);
    }
    const text = await res.text(); let json: any; try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown, o?: { csrf?: boolean; headers?: Record<string, string> }) => this.req('POST', p, b ?? {}, o);
  del = (p: string) => this.req('DELETE', p);
  patch = (p: string, b?: unknown) => this.req('PATCH', p, b ?? {});
}

export async function startServer() {
  const { connectMongo } = await import('../../src/config/database');
  const { buildApp } = await import('../../src/app');
  const { buildOrchestrator } = await import('../../src/orchestrator/bootstrap');
  const { startEmailWorker } = await import('../../src/workers/emailWorker');
  await connectMongo();
  const orchestrator = buildOrchestrator();
  const app = buildApp(orchestrator);
  const server = http.createServer(app);
  const { attachSocketGateway } = await import('../../src/realtime/socket');
  const { eventBus } = await import('../../src/events/eventBus');
  await eventBus.start();
  const io = attachSocketGateway(server, orchestrator);
  server.listen(0);
  const worker = startEmailWorker();
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, origin, server, worker, stop: async () => { io.close(); await eventBus.stop(); await worker.close(); await new Promise((r) => server.close(r)); } };
}

export const uniqueEmail = (p = 'user') => `${p}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@test.dev`;
export const PASSWORD = 'Sup3r-secret-pass';
export const waitFor = async <T>(fn: () => T | undefined, ms = 8000) => { const t0 = Date.now(); for (;;) { try { const v = fn(); if (v) return v; } catch { /* retry */ } if (Date.now() - t0 > ms) throw new Error('waitFor timeout'); await new Promise((r) => setTimeout(r, 50)); } };

export async function registerAndLogin(base: string, role?: string) {
  const email = uniqueEmail(); const c = new Client(base);
  expect202(await c.post('/auth/register', { name: 'Test User', email, password: PASSWORD }));
  const token = await waitFor(() => { try { return lastLink(email, 'verify-email'); } catch { return undefined; } });
  await c.post('/auth/verify-email', { token });
  if (role) { const { User } = await import('../../src/models/User'); await User.updateOne({ email }, { $set: { role } }); }
  const login = await c.post('/auth/login', { email, password: PASSWORD });
  if (login.status !== 200) throw new Error('login failed ' + JSON.stringify(login.body));
  return { c, email, user: login.body.user };
}
function expect202(r: Resp) { if (r.status !== 202) throw new Error('register ' + r.status + JSON.stringify(r.body)); }
