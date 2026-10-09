export interface User { id: string; email: string; name: string; role: string; emailVerified: boolean }
export interface Segment { airlineName: string; flightNumber: string; origin: string; destination: string; departureTime: string; arrivalTime: string; durationMinutes: number }
export interface FlightOffer { offerId: string; segments: Segment[]; totalDurationMinutes: number; stops: number; price: { amount: number; currency: string }; refundable?: boolean; baggage?: string; priceType: 'LIVE' | 'DEMO'; fetchedAt: string }
export interface Loc { city: string; code: string }
export interface TripState {
  tripId: string; origin?: Loc; destinations: Loc[]; dates: { departure?: string; return?: string };
  travellers?: { adults: number; children: number; infants: number; assumed: boolean };
  budget?: { amount: number; currency: string }; requestedServices: string[];
  flights: { shortlist: FlightOffer[]; selectedOfferId?: string; lastSearchedAt?: string; revalidation?: { checkedAt: string; priceType: 'LIVE' | 'DEMO'; changed: boolean } };
  totalPrice?: { amount: number; currency: string; priceType: 'ESTIMATED' | 'LIVE' | 'CONFIRMED' | 'DEMO' };
  bookingStatus: string; paymentStatus: string;
}
export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; streaming?: boolean }
export interface ProgressStep { step: string; status: 'start' | 'done' | 'error'; label: string }
