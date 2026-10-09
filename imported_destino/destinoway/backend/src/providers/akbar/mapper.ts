import { z } from 'zod';
import { FlightOffer, FlightOfferSchema, ProviderError, type FlightSearchParams } from '../types';

/** PLACEHOLDER raw schema - replace with Akbar's real response shape (see endpoints.ts). Unknown/malformed data is rejected, never trusted. */
const RawSegment = z.object({ carrier: z.string(), carrierName: z.string().optional(), flightNo: z.string(), from: z.string(), to: z.string(), depart: z.string(), arrive: z.string(), durationMin: z.number() });
const RawResult = z.object({
  id: z.string(),
  fare: z.object({ total: z.number(), base: z.number().optional(), tax: z.number().optional(), currency: z.string().length(3) }),
  refundable: z.boolean().optional(),
  baggage: z.string().optional(),
  cabin: z.string().optional(),
  expiresAt: z.string().optional(),
  journeys: z.array(z.object({ segments: z.array(RawSegment).min(1) })).min(1),
});
export const RawSearchResponse = z.object({ results: z.array(z.unknown()) });

const clean = (s: string) => s.replace(/[\u0000-\u001f<>]/g, '').slice(0, 80); // provider text is untrusted (prompt-injection hygiene)

export function mapSearchResponse(raw: unknown, _p: FlightSearchParams): FlightOffer[] {
  const top = RawSearchResponse.safeParse(raw);
  if (!top.success) throw new ProviderError('akbar', 'INVALID_RESPONSE', 'unexpected search response shape');
  const offers: FlightOffer[] = [];
  for (const item of top.data.results) {
    const r = RawResult.safeParse(item);
    if (!r.success) continue; // skip a single malformed offer, keep the rest (graceful degradation)
    const d = r.data;
    const toSeg = (s: z.infer<typeof RawSegment>) => ({ airlineCode: clean(s.carrier), airlineName: clean(s.carrierName ?? s.carrier), flightNumber: clean(s.flightNo), origin: s.from, destination: s.to, departureTime: s.depart, arrivalTime: s.arrive, durationMinutes: Math.round(s.durationMin) });
    const out = d.journeys[0]!.segments.map(toSeg);
    const back = (d.journeys[1]?.segments ?? []).map(toSeg);
    const parsed = FlightOfferSchema.safeParse({
      offerId: `akbar_${d.id}`, provider: 'akbar', providerRef: d.id, segments: out, returnSegments: back,
      totalDurationMinutes: out.reduce((a, s) => a + s.durationMinutes, 0), stops: out.length - 1,
      price: { amount: d.fare.total, currency: d.fare.currency }, baseFare: d.fare.base, taxes: d.fare.tax,
      refundable: d.refundable, baggage: d.baggage ? clean(d.baggage) : undefined, cabin: d.cabin ?? 'ECONOMY',
      priceType: 'LIVE', fetchedAt: new Date().toISOString(), expiresAt: d.expiresAt,
    });
    if (parsed.success) offers.push(parsed.data);
  }
  return offers;
}
