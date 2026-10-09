import { AkbarClient } from './client';
import { AKBAR_ENDPOINTS as E } from './endpoints';
import { mapSearchResponse } from './mapper';
import { BookingResult, CallOptions, CancellationResult, FlightOffer, FlightProviderInterface, FlightSearchParams, PassengerInput, PriceRevalidation, ProviderError } from '../types';

const path = (tpl: string, id: string) => tpl.replace(':id', encodeURIComponent(id));

export class AkbarTravelProvider implements FlightProviderInterface {
  readonly name = 'akbar';
  readonly mode = 'LIVE' as const;
  readonly priority = 10;
  constructor(private client = new AkbarClient()) {}

  async searchFlights(p: FlightSearchParams, o: CallOptions = {}): Promise<FlightOffer[]> {
    const raw = await this.client.request(E.search.method, E.search.path, {
      origin: p.origin, destination: p.destination, departureDate: p.departureDate, returnDate: p.returnDate,
      passengers: { adults: p.adults, children: p.children, infants: p.infants }, cabin: p.cabin ?? 'ECONOMY', currency: p.currency,
    }, o);
    return mapSearchResponse(raw, p);
  }
  async getFlightDetails(offer: FlightOffer, o: CallOptions = {}): Promise<FlightOffer> {
    const raw = await this.client.request(E.details.method, E.details.path, { ref: offer.providerRef }, o);
    const [mapped] = mapSearchResponse({ results: [raw] }, { origin: '', destination: '', departureDate: '', adults: 1, children: 0, infants: 0, currency: offer.price.currency });
    if (!mapped) throw new ProviderError('akbar', 'INVALID_RESPONSE', 'details response malformed');
    return mapped;
  }
  async checkAvailability(offer: FlightOffer, o: CallOptions = {}): Promise<boolean> {
    const raw = await this.client.request<{ available?: boolean }>(E.availability.method, E.availability.path, { ref: offer.providerRef }, o);
    if (typeof raw?.available !== 'boolean') throw new ProviderError('akbar', 'INVALID_RESPONSE', 'availability malformed');
    return raw.available;
  }
  async revalidatePrice(offer: FlightOffer, o: CallOptions = {}): Promise<PriceRevalidation> {
    const raw = await this.client.request<{ available?: boolean; total?: number; currency?: string; cancellationRules?: string }>(E.revalidate.method, E.revalidate.path, { ref: offer.providerRef }, o);
    if (typeof raw?.available !== 'boolean' || typeof raw.total !== 'number') throw new ProviderError('akbar', 'INVALID_RESPONSE', 'reprice malformed');
    const currency = raw.currency ?? offer.price.currency;
    return { available: raw.available, previousPrice: offer.price, currentPrice: { amount: raw.total, currency }, changed: raw.total !== offer.price.amount || currency !== offer.price.currency, cancellationRules: raw.cancellationRules?.slice(0, 1000), checkedAt: new Date().toISOString(), priceType: 'LIVE' };
  }
  async createBooking(offer: FlightOffer, passengers: PassengerInput[], o: CallOptions & { idempotencyKey: string }): Promise<BookingResult> {
    const raw = await this.client.request<{ bookingId?: string; pnr?: string; status?: string }>(E.createBooking.method, E.createBooking.path, { ref: offer.providerRef, passengers }, o);
    return this.toBooking(raw, offer.price);
  }
  async confirmBooking(id: string, o: CallOptions = {}): Promise<BookingResult> {
    const raw = await this.client.request<{ bookingId?: string; pnr?: string; status?: string }>(E.confirmBooking.method, path(E.confirmBooking.path, id), {}, o);
    return this.toBooking(raw, { amount: 0, currency: 'INR' });
  }
  async cancelBooking(id: string, o: CallOptions = {}): Promise<CancellationResult> {
    const raw = await this.client.request<{ status?: string; refundAmount?: number; currency?: string }>(E.cancelBooking.method, path(E.cancelBooking.path, id), {}, o);
    const status = raw?.status === 'CANCELLED' ? 'CANCELLED' : raw?.status === 'PENDING' ? 'PENDING' : 'FAILED';
    return { status, refundAmount: typeof raw?.refundAmount === 'number' ? { amount: raw.refundAmount, currency: raw.currency ?? 'INR' } : undefined };
  }
  async getBookingDetails(id: string, o: CallOptions = {}): Promise<BookingResult> {
    const raw = await this.client.request<{ bookingId?: string; pnr?: string; status?: string }>(E.getBooking.method, path(E.getBooking.path, id), undefined, o);
    return this.toBooking(raw, { amount: 0, currency: 'INR' });
  }
  async healthCheck(): Promise<boolean> {
    try { await this.client.request(E.health.method, E.health.path, undefined); return true; } catch { return false; }
  }
  private toBooking(raw: { bookingId?: string; pnr?: string; status?: string }, price: { amount: number; currency: string }): BookingResult {
    if (!raw?.bookingId) throw new ProviderError('akbar', 'INVALID_RESPONSE', 'booking response malformed');
    const status = raw.status === 'CONFIRMED' ? 'CONFIRMED' : raw.status === 'FAILED' ? 'FAILED' : 'PENDING'; // never assume CONFIRMED
    return { providerBookingId: raw.bookingId, pnr: raw.pnr, status, totalPrice: price };
  }
}
