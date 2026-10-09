import { ProviderError } from './types';
import { providerFailures, providerLatency } from '../observability/metrics';
import { logger } from '../observability/logger';

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
/** Per-provider circuit breaker (per Node instance; good enough because it only reduces load - Redis-shared state can be added later). */
export class CircuitBreaker {
  private state: State = 'CLOSED';
  private failures = 0;
  private openedAt = 0;
  constructor(private threshold = 5, private cooldownMs = 30_000) {}
  canRequest(now = Date.now()) {
    if (this.state === 'OPEN') {
      if (now - this.openedAt >= this.cooldownMs) { this.state = 'HALF_OPEN'; return true; }
      return false;
    }
    return true;
  }
  onSuccess() { this.failures = 0; this.state = 'CLOSED'; }
  onFailure(now = Date.now()) {
    this.failures++;
    if (this.state === 'HALF_OPEN' || this.failures >= this.threshold) { this.state = 'OPEN'; this.openedAt = now; }
  }
  get status() { return this.state; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ResilienceOptions { provider: string; op: string; timeoutMs: number; retries: number; baseDelayMs?: number; breaker: CircuitBreaker }

/** Timeout + retry (exponential backoff with jitter, only for retryable errors) + circuit breaker. */
export async function withResilience<T>(opts: ResilienceOptions, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const { provider, op, breaker } = opts;
  if (!breaker.canRequest()) {
    providerFailures.inc({ provider, op, reason: 'CIRCUIT_OPEN' });
    throw new ProviderError(provider, 'UNAVAILABLE', 'circuit open', false);
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    const end = providerLatency.startTimer({ provider, op });
    try {
      const out = await fn(ctrl.signal);
      end({ status: 'ok' });
      breaker.onSuccess();
      return out;
    } catch (e) {
      end({ status: 'error' });
      const err = ctrl.signal.aborted && !(e instanceof ProviderError) ? new ProviderError(provider, 'TIMEOUT', `timeout after ${opts.timeoutMs}ms`, true) : e;
      lastErr = err;
      const pe = err instanceof ProviderError ? err : new ProviderError(provider, 'UPSTREAM', (err as Error).message, true);
      providerFailures.inc({ provider, op, reason: pe.kind });
      if (!pe.retryable || attempt === opts.retries) { if (pe.kind !== 'BAD_REQUEST') breaker.onFailure(); throw pe; }
      const delay = Math.min(4000, (opts.baseDelayMs ?? 300) * 2 ** attempt) * (0.5 + Math.random() / 2);
      logger.warn({ provider, op, attempt, kind: pe.kind, delay: Math.round(delay) }, 'provider retry');
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
