import { z } from 'zod';

export const MoneySchema = z.object({ amount: z.number().nonnegative(), currency: z.string().length(3) });
export type Money = z.infer<typeof MoneySchema>;

export const SegmentSchema = z.object({
  airlineCode: z.string(), airlineName: z.string(), flightNumber: z.string(),
  origin: z.string().length(3), destination: z.string().length(3),
  departureTime: z.string(), arrivalTime: z.string(), durationMinutes: z.number().int().nonnegative(),
});

/** Internal PanJourney->Destinoway flight schema. Orchestrator and UI only ever see THIS, never a provider format. */
export const FlightOfferSchema = z.object({
  offerId: z.string(),                      // internal, stable within a search
  provider: z.string(),                     // 'akbar' | 'mock' | ...
  providerRef: z.string(),                  // opaque provider handle for revalidate/book (server-side only)
  segments: z.array(SegmentSchema).min(1),
  returnSegments: z.array(SegmentSchema).default([]),
  totalDurationMinutes: z.number().int().nonnegative(),
  stops: z.number().int().nonnegative(),
  price: MoneySchema,
  baseFare: z.number().nonnegative().optional(),
  taxes: z.number().nonnegative().optional(),
  refundable: z.boolean().optional(),
  baggage: z.string().optional(),
  cabin: z.string().default('ECONOMY'),
  priceType: z.enum(['LIVE', 'DEMO']),       // DEMO = mock mode; never bookable
  fetchedAt: z.string(),
  expiresAt: z.string().optional(),
});
export type FlightOffer = z.infer<typeof FlightOfferSchema>;
export type FlightSegment = z.infer<typeof SegmentSchema>;

export interface FlightSearchParams {
  origin: string; destination: string; departureDate: string; returnDate?: string;
  adults: number; children: number; infants: number; cabin?: string; currency: string;
}
export interface PriceRevalidation {
  available: boolean; previousPrice: Money; currentPrice: Money; changed: boolean;
  cancellationRules?: string; checkedAt: string; priceType: 'LIVE' | 'DEMO';
}
export interface PassengerInput { type: 'ADT' | 'CHD' | 'INF'; title: string; firstName: string; lastName: string; dob: string; passport?: string }
export interface BookingResult { providerBookingId: string; pnr?: string; status: 'PENDING' | 'CONFIRMED' | 'FAILED'; totalPrice: Money; raw?: never }
export interface CancellationResult { status: 'CANCELLED' | 'PENDING' | 'FAILED'; refundAmount?: Money }

export interface CallOptions { signal?: AbortSignal; requestId?: string }

export interface FlightProviderInterface {
  readonly name: string;
  readonly mode: 'LIVE' | 'DEMO';
  /** Lower number = tried first. */
  readonly priority: number;
  searchFlights(p: FlightSearchParams, o?: CallOptions): Promise<FlightOffer[]>;
  getFlightDetails(offer: FlightOffer, o?: CallOptions): Promise<FlightOffer>;
  checkAvailability(offer: FlightOffer, o?: CallOptions): Promise<boolean>;
  revalidatePrice(offer: FlightOffer, o?: CallOptions): Promise<PriceRevalidation>;
  createBooking(offer: FlightOffer, passengers: PassengerInput[], o?: CallOptions & { idempotencyKey: string }): Promise<BookingResult>;
  confirmBooking(providerBookingId: string, o?: CallOptions): Promise<BookingResult>;
  cancelBooking(providerBookingId: string, o?: CallOptions): Promise<CancellationResult>;
  getBookingDetails(providerBookingId: string, o?: CallOptions): Promise<BookingResult>;
  healthCheck(): Promise<boolean>;
}

export class ProviderError extends Error {
  constructor(public provider: string, public kind: 'TIMEOUT' | 'RATE_LIMITED' | 'UPSTREAM' | 'INVALID_RESPONSE' | 'UNAVAILABLE' | 'AUTH' | 'BAD_REQUEST', message: string, public retryable = false) {
    super(message);
  }
}
