import type { FlightOffer } from '@/types';

const fmtT = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }).format(new Date(iso));
export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const dur = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

/** Trust labelling: Estimated / Live / Confirmed (+ Demo in mock mode). Never implies more certainty than the backend gave us. */
export function PriceBadge({ type }: { type: 'ESTIMATED' | 'LIVE' | 'CONFIRMED' | 'DEMO' }) {
  const m = { ESTIMATED: ['Estimated', 'bg-slate2/15 text-slate2'], LIVE: ['Live price', 'bg-teal-soft text-teal'], CONFIRMED: ['Confirmed', 'bg-teal text-white'], DEMO: ['Demo data · not bookable', 'bg-marigold/25 text-ink'] } as const;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${m[type][1]}`}>{m[type][0]}</span>;
}

export function FlightCard({ offer, selected, index, onSelect }: { offer: FlightOffer; selected: boolean; index: number; onSelect: (i: number) => void }) {
  const first = offer.segments[0]!, last = offer.segments[offer.segments.length - 1]!;
  return (
    <article className={`rounded-xl border bg-white p-4 ${selected ? 'border-teal ring-2 ring-teal/30' : 'border-ink/10'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold">{first.airlineName} <span className="font-body text-sm font-normal text-slate2">{first.flightNumber}</span></p>
          <p className="mt-0.5 text-[15px]">{fmtT(first.departureTime)} {first.origin} → {fmtT(last.arrivalTime)} {last.destination}</p>
          <p className="text-sm text-slate2">{dur(offer.totalDurationMinutes)} · {offer.stops === 0 ? 'Non-stop' : `${offer.stops} stop`}{offer.refundable ? ' · Refundable' : ''}{offer.baggage ? ` · ${offer.baggage}` : ''}</p>
        </div>
        <div className="text-right"><p className="font-display text-xl font-bold">{inr(offer.price.amount)}</p><PriceBadge type={offer.priceType} /></div>
      </div>
      <button onClick={() => onSelect(index + 1)} className={`mt-3 ${selected ? 'btn-ghost' : 'btn'} w-full`} disabled={selected}>{selected ? 'Selected' : 'Select this flight'}</button>
    </article>
  );
}
