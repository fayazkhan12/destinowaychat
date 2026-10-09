'use client';
import { useState } from 'react';
import { useSession } from '@/store/session';
import { FlightCard, PriceBadge, inr } from './FlightCard';

const TABS = ['Flights', 'Hotels', 'Cab', 'Activities', 'Budget', 'Itinerary', 'Status'] as const;
type Tab = (typeof TABS)[number];

const Soon = ({ what, requested }: { what: string; requested: boolean }) => (
  <p className="rounded-xl border border-dashed border-ink/20 p-4 text-slate2">{requested ? `I’ve noted your ${what} request.` : ''} {what[0]!.toUpperCase() + what.slice(1)} search isn’t available yet — it’s the next thing being added.</p>
);

export function TripWorkspace({ onSelect }: { onSelect: (n: number) => void }) {
  const trip = useSession((s) => s.trip); const [tab, setTab] = useState<Tab>('Flights');
  const req = (s: string) => Boolean(trip?.requestedServices.includes(s));
  const sel = trip?.flights.shortlist.find((o) => o.offerId === trip.flights.selectedOfferId);
  return (
    <section aria-label="Trip workspace" className="flex h-full min-h-0 flex-col rounded-2xl border border-ink/10 bg-white">
      <header className="border-b border-ink/10 p-4">
        <h2 className="text-xl font-bold">{trip?.origin && trip.destinations[0] ? `${trip.origin.city} → ${trip.destinations[0].city}` : 'Your trip'}</h2>
        <p className="text-sm text-slate2">{[trip?.dates.departure, trip?.travellers ? `${trip.travellers.adults} adult${trip.travellers.adults > 1 ? 's' : ''}${trip.travellers.assumed ? ' (assumed)' : ''}` : '', trip?.budget ? `budget ${inr(trip.budget.amount)}` : ''].filter(Boolean).join(' · ') || 'Details appear here as we talk.'}</p>
      </header>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-ink/10 px-2 pt-2">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-semibold ${tab === t ? 'bg-teal-soft text-teal' : 'text-slate2 hover:text-ink'}`}>{t}</button>)}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {tab === 'Flights' && (trip?.flights.shortlist.length
          ? trip.flights.shortlist.map((o, i) => <FlightCard key={o.offerId} offer={o} index={i} selected={o.offerId === trip.flights.selectedOfferId} onSelect={onSelect} />)
          : <p className="text-slate2">Flights I find will show up here.</p>)}
        {tab === 'Hotels' && <Soon what="hotel" requested={req('HOTEL')} />}
        {tab === 'Cab' && <Soon what="airport transfer" requested={req('CAB')} />}
        {tab === 'Activities' && <Soon what="activity" requested={req('ACTIVITY')} />}
        {tab === 'Budget' && (
          <div className="space-y-3">
            {trip?.budget ? <p>Budget <strong>{inr(trip.budget.amount)}</strong></p> : <p className="text-slate2">No budget set yet.</p>}
            {trip?.totalPrice ? (<>
              <p className="flex items-center gap-2">Selected so far <strong>{inr(trip.totalPrice.amount)}</strong> <PriceBadge type={trip.totalPrice.priceType} /></p>
              {trip.budget && <div><div className="h-2.5 overflow-hidden rounded-full bg-mist"><div className={`h-full ${trip.totalPrice.amount > trip.budget.amount ? 'bg-red-600' : 'bg-teal'}`} style={{ width: `${Math.min(100, (trip.totalPrice.amount / trip.budget.amount) * 100)}%` }} /></div>
                <p className="mt-1 text-sm text-slate2">{trip.totalPrice.amount > trip.budget.amount ? `${inr(trip.totalPrice.amount - trip.budget.amount)} over budget` : `${inr(trip.budget.amount - trip.totalPrice.amount)} remaining`}</p></div>}
            </>) : <p className="text-slate2">Select a flight to see the running total.</p>}
          </div>
        )}
        {tab === 'Itinerary' && <p className="text-slate2">Your day-by-day itinerary is built once flights, stays and activities are chosen.</p>}
        {tab === 'Status' && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-slate2">Selected flight</dt><dd>{sel ? `${sel.segments[0]!.airlineName} ${sel.segments[0]!.flightNumber}` : 'None yet'}</dd>
            <dt className="text-slate2">Price check</dt><dd>{trip?.flights.revalidation ? `${trip.flights.revalidation.priceType === 'LIVE' ? 'Live' : 'Demo'} · ${new Date(trip.flights.revalidation.checkedAt).toLocaleTimeString()}` : 'Not checked'}</dd>
            <dt className="text-slate2">Booking</dt><dd>{trip?.bookingStatus === 'NOT_STARTED' ? 'Not booked — nothing has been charged' : trip?.bookingStatus}</dd>
            <dt className="text-slate2">Payment</dt><dd>{trip?.paymentStatus === 'NOT_STARTED' ? 'No payment made' : trip?.paymentStatus}</dd>
          </dl>
        )}
      </div>
    </section>
  );
}
