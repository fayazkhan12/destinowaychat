import { createHash } from 'node:crypto';
import { FlightOffer, FlightProviderInterface, FlightSearchParams, PriceRevalidation, ProviderError, BookingResult, CancellationResult } from './types';

/**
 * MOCK MODE ONLY. Deterministic demo data so the UI/orchestrator can be developed without credentials.
 * Every offer is tagged priceType='DEMO' and is NEVER bookable. Disabled when TRAVEL_PROVIDER_MODE=production.
 */
const AIRLINES = [
  ['6E', 'IndiGo'], ['AI', 'Air India'], ['EK', 'Emirates'], ['SG', 'SpiceJet'], ['IX', 'Air India Express'], ['QP', 'Akasa Air'],
] as const;

const seed = (s: string) => parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16);
const iso = (date: string, mins: number) => new Date(new Date(date + 'T00:00:00+05:30').getTime() + mins * 60_000).toISOString();

export class MockFlightProvider implements FlightProviderInterface {
  readonly name = 'mock';
  readonly mode = 'DEMO' as const;
  readonly priority = 100;

  async searchFlights(p: FlightSearchParams): Promise<FlightOffer[]> {
    const base = seed(`${p.origin}-${p.destination}`);
    const intl = !['JAI', 'DEL', 'BOM', 'GOI', 'GOX', 'BLR', 'HYD', 'MAA', 'CCU', 'COK', 'AMD', 'PNQ', 'LKO', 'UDR'].includes(p.destination);
    const routeBase = intl ? 14000 + (base % 9000) : 3200 + (base % 3200);
    const pax = p.adults + p.children;
    const out: FlightOffer[] = [];
    for (let i = 0; i < 7; i++) {
      const s = seed(`${p.origin}${p.destination}${p.departureDate}${i}`);
      const [code, airline] = AIRLINES[s % AIRLINES.length]!;
      const depMin = 300 + ((s >> 3) % 17) * 50;
      const dur = (intl ? 200 : 95) + (s % 60) + (i % 3 === 2 ? 110 : 0);
      const stops = i % 3 === 2 ? 1 : 0;
      const fare = Math.round((routeBase * (0.85 + ((s >> 5) % 50) / 100) * pax) / 10) * 10;
      const seg = { airlineCode: code, airlineName: airline, flightNumber: `${code}${100 + (s % 800)}`, origin: p.origin, destination: p.destination, departureTime: iso(p.departureDate, depMin), arrivalTime: iso(p.departureDate, depMin + dur), durationMinutes: dur };
      out.push({
        offerId: `mock_${s.toString(16)}_${i}`, provider: 'mock', providerRef: `MOCK-${s}`, segments: [seg], returnSegments: [],
        totalDurationMinutes: dur, stops, price: { amount: fare, currency: p.currency }, baseFare: Math.round(fare * 0.78), taxes: Math.round(fare * 0.22),
        refundable: i % 2 === 0, baggage: intl ? '25 kg check-in' : '15 kg check-in', cabin: p.cabin ?? 'ECONOMY', priceType: 'DEMO', fetchedAt: new Date().toISOString(),
      });
    }
    return out;
  }
  async getFlightDetails(o: FlightOffer) { return o; }
  async checkAvailability() { return true; }
  async revalidatePrice(o: FlightOffer): Promise<PriceRevalidation> {
    return { available: true, previousPrice: o.price, currentPrice: o.price, changed: false, checkedAt: new Date().toISOString(), priceType: 'DEMO' };
  }
  private refuse(): never { throw new ProviderError('mock', 'UNAVAILABLE', 'Mock provider cannot create real bookings', false); }
  async createBooking(): Promise<BookingResult> { return this.refuse(); }
  async confirmBooking(): Promise<BookingResult> { return this.refuse(); }
  async cancelBooking(): Promise<CancellationResult> { return this.refuse(); }
  async getBookingDetails(): Promise<BookingResult> { return this.refuse(); }
  async healthCheck() { return true; }
}
