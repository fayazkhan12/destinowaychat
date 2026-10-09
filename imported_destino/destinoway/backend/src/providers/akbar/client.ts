import { env } from '../../config/env';
import { logger, sanitizeForLog } from '../../observability/logger';
import { ProviderError } from '../types';

/** Server-side-only HTTP client for Akbar. Credentials never leave this process and are never logged. */
export class AkbarClient {
  constructor(private baseUrl = env.AKBAR_BASE_URL!, private timeoutMs = env.AKBAR_TIMEOUT_MS) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json', ...extra };
    if (env.AKBAR_API_KEY) h[env.AKBAR_API_KEY_HEADER] = env.AKBAR_API_KEY;
    if (env.AKBAR_USERNAME && env.AKBAR_PASSWORD) h['authorization'] = 'Basic ' + Buffer.from(`${env.AKBAR_USERNAME}:${env.AKBAR_PASSWORD}`).toString('base64'); // ADAPT if Akbar uses token login
    return h;
  }

  async request<T = unknown>(method: string, path: string, body: unknown, opts: { signal?: AbortSignal; requestId?: string; idempotencyKey?: string } = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (url.protocol !== 'https:' && env.NODE_ENV === 'production') throw new ProviderError('akbar', 'BAD_REQUEST', 'Akbar base URL must be https in production'); // SSRF/transport safety
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: this.headers({ ...(opts.requestId ? { 'x-request-id': opts.requestId } : {}), ...(opts.idempotencyKey ? { 'idempotency-key': opts.idempotencyKey } : {}) }),
        body: method === 'GET' ? undefined : JSON.stringify(body),
        signal: opts.signal ?? AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError';
      throw new ProviderError('akbar', aborted ? 'TIMEOUT' : 'UNAVAILABLE', aborted ? 'request timed out' : 'network error', true);
    }
    logger.debug({ provider: 'akbar', method, path, status: res.status, ms: Date.now() - started, body: sanitizeForLog(body) }, 'akbar call');
    if (res.status === 429) throw new ProviderError('akbar', 'RATE_LIMITED', 'rate limited', true);
    if (res.status === 401 || res.status === 403) throw new ProviderError('akbar', 'AUTH', 'provider authentication failed', false);
    if (res.status >= 500) throw new ProviderError('akbar', 'UPSTREAM', `upstream ${res.status}`, true);
    if (res.status >= 400) throw new ProviderError('akbar', 'BAD_REQUEST', `provider rejected request (${res.status})`, false);
    try { return (await res.json()) as T; } catch { throw new ProviderError('akbar', 'INVALID_RESPONSE', 'response was not JSON', false); }
  }
}
