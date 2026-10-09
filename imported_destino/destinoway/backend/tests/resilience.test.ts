import { describe, it, expect } from 'vitest';
import { CircuitBreaker, withResilience } from '../src/providers/resilience';
import { ProviderRegistry } from '../src/providers/ProviderRegistry';
import { MockFlightProvider } from '../src/providers/mockFlightProvider';
import { ProviderError, type FlightProviderInterface } from '../src/providers/types';
import { mapSearchResponse } from '../src/providers/akbar/mapper';

const params = { origin: 'JAI', destination: 'DXB', departureDate: '2030-11-15', adults: 2, children: 0, infants: 0, currency: 'INR' };
const opts = (breaker = new CircuitBreaker()) => ({ provider: 'p', op: 'search', timeoutMs: 50, retries: 2, baseDelayMs: 1, breaker });

describe('resilience', () => {
  it('retries retryable errors then succeeds', async () => {
    let n = 0;
    const r = await withResilience(opts(), async () => { if (++n < 3) throw new ProviderError('p', 'UPSTREAM', '503', true); return 'ok'; });
    expect(r).toBe('ok'); expect(n).toBe(3);
  });
  it('does not retry non-retryable errors', async () => {
    let n = 0;
    await expect(withResilience(opts(), async () => { n++; throw new ProviderError('p', 'BAD_REQUEST', '400', false); })).rejects.toThrow();
    expect(n).toBe(1);
  });
  it('times out hung calls', async () => {
    await expect(withResilience({ ...opts(), retries: 0 }, (signal) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))))).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });
  it('opens the circuit after repeated failures', async () => {
    const b = new CircuitBreaker(2, 10_000);
    for (let i = 0; i < 2; i++) await withResilience({ ...opts(b), retries: 0 }, async () => { throw new ProviderError('p', 'UPSTREAM', 'x', true); }).catch(() => undefined);
    await expect(withResilience(opts(b), async () => 'never')).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });
});

describe('ProviderRegistry', () => {
  it('one provider failing does not fail the search (graceful degradation)', async () => {
    const broken: FlightProviderInterface = Object.assign(new MockFlightProvider(), { name: 'broken', priority: 1, searchFlights: async () => { throw new ProviderError('broken', 'UPSTREAM', '502', false); } });
    const reg = new ProviderRegistry({ timeoutMs: 100, retries: 0, baseDelayMs: 1 }).register(broken).register(new MockFlightProvider());
    const r = await reg.searchFlights(params);
    expect(r.offers.length).toBeGreaterThan(0);
    expect(r.statuses.find((s) => s.provider === 'broken')?.ok).toBe(false);
  });
  it('mock offers are always tagged DEMO and cannot be booked', async () => {
    const p = new MockFlightProvider(); const [o] = await p.searchFlights(params);
    expect(o!.priceType).toBe('DEMO');
    await expect(p.createBooking()).rejects.toThrow();
  });
});

describe('Akbar mapper', () => {
  it('rejects malformed top-level responses and skips malformed offers', () => {
    expect(() => mapSearchResponse({ nope: 1 }, params)).toThrow();
    expect(mapSearchResponse({ results: [{ garbage: true }] }, params)).toEqual([]);
  });
  it('maps valid offers into the internal schema and sanitises provider text', () => {
    const seg = { carrier: '6E', carrierName: 'Indi<script>Go', flightNo: '6E100', from: 'JAI', to: 'DXB', depart: '2030-11-15T10:00:00Z', arrive: '2030-11-15T13:00:00Z', durationMin: 180 };
    const [o] = mapSearchResponse({ results: [{ id: 'X1', fare: { total: 9000, currency: 'INR' }, journeys: [{ segments: [seg] }] }] }, params);
    expect(o).toMatchObject({ provider: 'akbar', priceType: 'LIVE', price: { amount: 9000 } });
    expect(o!.segments[0]!.airlineName).not.toContain('<');
  });
});
