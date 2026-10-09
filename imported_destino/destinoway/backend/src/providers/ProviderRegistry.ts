import { CircuitBreaker, withResilience } from './resilience';
import { FlightOffer, FlightProviderInterface, FlightSearchParams, PriceRevalidation, ProviderError } from './types';
import { logger } from '../observability/logger';

export interface ProviderStatus { provider: string; ok: boolean; error?: string; count?: number; breaker: string }
export interface AggregatedSearch { offers: FlightOffer[]; statuses: ProviderStatus[] }

/** Registry of flight providers. Add a provider = register() it; nothing else changes. */
export class ProviderRegistry {
  private providers = new Map<string, { p: FlightProviderInterface; breaker: CircuitBreaker }>();
  constructor(private opts = { timeoutMs: 15_000, retries: 2, baseDelayMs: 300 }) {}

  register(p: FlightProviderInterface) { this.providers.set(p.name, { p, breaker: new CircuitBreaker() }); return this; }
  list() { return [...this.providers.values()].map((x) => x.p).sort((a, b) => a.priority - b.priority); }
  get(name: string) { return this.providers.get(name)?.p; }
  private breaker(name: string) { return this.providers.get(name)!.breaker; }

  /** Query ALL providers in parallel; one failing provider never fails the search (graceful degradation). */
  async searchFlights(params: FlightSearchParams, requestId?: string): Promise<AggregatedSearch> {
    const list = this.list();
    if (!list.length) throw new ProviderError('registry', 'UNAVAILABLE', 'no flight providers configured');
    const settled = await Promise.allSettled(list.map((p) =>
      withResilience({ provider: p.name, op: 'search', timeoutMs: this.opts.timeoutMs, retries: this.opts.retries, baseDelayMs: this.opts.baseDelayMs, breaker: this.breaker(p.name) },
        (signal) => p.searchFlights(params, { signal, requestId }))));
    const offers: FlightOffer[] = [];
    const statuses: ProviderStatus[] = settled.map((r, i) => {
      const name = list[i]!.name;
      const breaker = this.breaker(name).status;
      if (r.status === 'fulfilled') { offers.push(...r.value); return { provider: name, ok: true, count: r.value.length, breaker }; }
      logger.warn({ provider: name, err: (r.reason as Error).message }, 'provider search failed');
      return { provider: name, ok: false, error: r.reason instanceof ProviderError ? r.reason.kind : 'UNKNOWN', breaker };
    });
    return { offers, statuses };
  }

  /** Revalidate with the SAME provider that issued the offer. Fail closed: if it cannot be confirmed, it is not bookable. */
  async revalidate(offer: FlightOffer, requestId?: string): Promise<PriceRevalidation> {
    const entry = this.providers.get(offer.provider);
    if (!entry) throw new ProviderError(offer.provider, 'UNAVAILABLE', 'provider not registered');
    return withResilience({ provider: offer.provider, op: 'revalidate', timeoutMs: this.opts.timeoutMs, retries: 1, breaker: entry.breaker }, (signal) => entry.p.revalidatePrice(offer, { signal, requestId }));
  }

  async health() {
    return Promise.all(this.list().map(async (p) => ({ provider: p.name, mode: p.mode, ok: await p.healthCheck().catch(() => false), breaker: this.breaker(p.name).status })));
  }
}
