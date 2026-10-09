import type { Agent, AgentContext, AgentResult, AgentTask, Fact, TripState } from '../orchestrator/types';
import type { FlightOffer } from '../providers/types';
import { sanitizeExternalText } from '../orchestrator/guard';
import { eventBus } from '../events/eventBus';

const toView = (o: FlightOffer) => {
  const first = o.segments[0]!, last = o.segments[o.segments.length - 1]!;
  return { airline: sanitizeExternalText(first.airlineName), flightNumber: sanitizeExternalText(first.flightNumber, 12), dep: first.departureTime, arr: last.arrivalTime, durationMinutes: o.totalDurationMinutes, stops: o.stops, price: o.price.amount, refundable: o.refundable };
};

/** Normalised score: lower is better. Price 60% / duration 30% / stops 10%. */
function bestValue(offers: FlightOffer[]): FlightOffer {
  const ps = offers.map((o) => o.price.amount), ds = offers.map((o) => o.totalDurationMinutes);
  const [pmin, pmax, dmin, dmax] = [Math.min(...ps), Math.max(...ps), Math.min(...ds), Math.max(...ds)];
  const n = (v: number, lo: number, hi: number) => (hi === lo ? 0 : (v - lo) / (hi - lo));
  return [...offers].sort((a, b) => (0.6 * n(a.price.amount, pmin, pmax) + 0.3 * n(a.totalDurationMinutes, dmin, dmax) + 0.1 * Math.min(a.stops, 2) / 2) - (0.6 * n(b.price.amount, pmin, pmax) + 0.3 * n(b.totalDurationMinutes, dmin, dmax) + 0.1 * Math.min(b.stops, 2) / 2))[0]!;
}
export function shortlistFrom(offers: FlightOffer[]): { shortlist: FlightOffer[]; cheapest: FlightOffer; fastest: FlightOffer; best: FlightOffer } {
  const byPrice = [...offers].sort((a, b) => a.price.amount - b.price.amount);
  const byTime = [...offers].sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes || a.price.amount - b.price.amount);
  const best = bestValue(offers);
  const picked: FlightOffer[] = [];
  for (const o of [byPrice[0]!, byTime[0]!, best, ...byPrice]) if (!picked.some((p) => p.offerId === o.offerId) && picked.length < 5) picked.push(o);
  return { shortlist: picked, cheapest: byPrice[0]!, fastest: byTime[0]!, best };
}

export class FlightAgent implements Agent {
  readonly id = 'FlightAgent';
  readonly domain = 'TRAVEL' as const;
  readonly services = ['FLIGHT'];
  readonly capabilities = ['SEARCH', 'COMPARE', 'RECOMMEND', 'AVAILABILITY', 'PRICE'] as const satisfies Agent['capabilities'];
  readonly description = 'Searches, compares and re-validates flights via the provider registry';

  missingSlots(s: TripState, t: AgentTask) {
    if (t.kind === 'select') return [];
    const m: Array<'origin' | 'destination' | 'date'> = [];
    if (!s.origin) m.push('origin');
    if (!s.destinations[0]) m.push('destination');
    if (!s.dates.departure) m.push('date');
    return m;
  }

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    return task.kind === 'select' ? this.select(task, ctx) : this.search(ctx);
  }

  private async search(ctx: AgentContext): Promise<AgentResult> {
    const s = ctx.state;
    const t = s.travellers ?? { adults: 1, children: 0, infants: 0, assumed: true };
    const returnDate = s.dates.return;
    ctx.emit({ type: 'progress', step: 'flights', status: 'start', label: "I'm checking the best available flights for you…" });
    void eventBus.publish('FLIGHT_SEARCH_STARTED', { userId: ctx.userId, tripId: ctx.tripId, requestId: ctx.requestId });
    const origin = s.origin!, dest = s.destinations[0]!;
    try {
      const { offers, statuses } = await ctx.callTool<{ offers: FlightOffer[]; statuses: Array<{ ok: boolean }> }>('searchFlights', {
        origin: origin.code, destination: dest.code, departureDate: s.dates.departure, returnDate, adults: t.adults, children: t.children, infants: t.infants, currency: s.currency,
      });
      const degraded = statuses.some((x) => !x.ok);
      void eventBus.publish('FLIGHT_SEARCH_COMPLETED', { userId: ctx.userId, tripId: ctx.tripId, requestId: ctx.requestId, payload: { count: offers.length } });
      if (!offers.length) {
        ctx.emit({ type: 'progress', step: 'flights', status: statuses.every((x) => !x.ok) ? 'error' : 'done', label: 'No flights found' });
        const facts: Fact[] = [{ type: statuses.length && statuses.every((x) => !x.ok) ? 'SEARCH_UNAVAILABLE' : 'NO_FLIGHTS', data: {} }];
        return { agentId: this.id, status: statuses.every((x) => !x.ok) ? 'FAILED' : 'OK', facts };
      }
      const { shortlist, cheapest, fastest, best } = shortlistFrom(offers);
      ctx.emit({ type: 'progress', step: 'flights', status: 'done', label: `✓ ${offers.length} flights found`, data: { count: offers.length } });
      const pref = ctx.sortPreference;
      const rec = pref === 'cheapest' ? cheapest : pref === 'fastest' ? fastest : pref === 'best_value' ? best : undefined;
      const demo = offers.every((o) => o.priceType === 'DEMO');
      const facts: Fact[] = [{ type: 'FLIGHT_RESULTS', data: { count: offers.length, origin: origin.city, destination: dest.city, date: s.dates.departure, demo, cheapest: toView(cheapest), fastest: toView(fastest), bestValue: toView(best), recommended: pref ? (pref === 'best_value' ? 'best-value' : pref) : undefined } }];
      if (degraded) facts.push({ type: 'PROVIDER_DEGRADED', data: {} });
      if (s.budget && cheapest.price.amount > s.budget.amount) facts.push({ type: 'OVER_BUDGET', data: { cheapest: cheapest.price.amount, budget: s.budget.amount } });
      void rec;
      return {
        agentId: this.id, status: degraded ? 'PARTIAL' : 'OK', facts,
        statePatch: (st) => ({ ...st, flights: { shortlist, selectedOfferId: undefined, lastSearchedAt: new Date().toISOString(), revalidation: undefined } }),
      };
    } catch {
      ctx.emit({ type: 'progress', step: 'flights', status: 'error', label: 'Flight search is slow right now' });
      return { agentId: this.id, status: 'FAILED', facts: [{ type: 'SEARCH_UNAVAILABLE', data: {} }] };
    }
  }

  private async select(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const list = ctx.state.flights.shortlist;
    if (!list.length) return { agentId: this.id, status: 'OK', facts: [{ type: 'NEED_SEARCH_FIRST', data: {} }] };
    const ref = (task.selection ?? '').toLowerCase();
    const { cheapest, fastest, best } = shortlistFrom(list);
    const chosen = ref === 'cheapest' ? cheapest : ref === 'fastest' ? fastest : ref === 'best_value' ? best : /^[1-9]$/.test(ref) ? list[Number(ref) - 1] : undefined;
    if (!chosen) return { agentId: this.id, status: 'OK', facts: [{ type: 'SELECTION_NOT_FOUND', data: {} }] };
    ctx.emit({ type: 'progress', step: 'revalidate', status: 'start', label: 'Re-checking the live price…' });
    try {
      const r = await ctx.callTool<{ available: boolean; previousPrice: { amount: number }; currentPrice: { amount: number; currency: string }; changed: boolean; checkedAt: string; priceType: 'LIVE' | 'DEMO' }>('revalidateFlightPrice', { offer: chosen });
      if (!r.available) { ctx.emit({ type: 'progress', step: 'revalidate', status: 'error', label: 'Fare no longer available' }); return { agentId: this.id, status: 'OK', facts: [{ type: 'FLIGHT_UNAVAILABLE', data: {} }] }; }
      ctx.emit({ type: 'progress', step: 'revalidate', status: 'done', label: r.changed ? 'Price changed' : '✓ Price confirmed' });
      if (r.changed) void eventBus.publish('PRICE_CHANGED', { userId: ctx.userId, tripId: ctx.tripId, payload: { from: r.previousPrice.amount, to: r.currentPrice.amount } });
      const updated: FlightOffer = { ...chosen, price: r.currentPrice, priceType: r.priceType, fetchedAt: r.checkedAt };
      return {
        agentId: this.id, status: 'OK',
        facts: [{ type: 'FLIGHT_SELECTED', data: { offer: toView(updated), demo: r.priceType === 'DEMO', changed: r.changed, previous: r.previousPrice.amount, current: r.currentPrice.amount } }],
        statePatch: (st) => ({
          ...st,
          flights: { ...st.flights, shortlist: st.flights.shortlist.map((o) => (o.offerId === chosen.offerId ? updated : o)), selectedOfferId: chosen.offerId, revalidation: { checkedAt: r.checkedAt, priceType: r.priceType, changed: r.changed, previousAmount: r.previousPrice.amount, currentAmount: r.currentPrice.amount } },
          totalPrice: { amount: r.currentPrice.amount, currency: r.currentPrice.currency, priceType: r.priceType === 'LIVE' ? 'LIVE' : 'DEMO' },
        }),
      };
    } catch {
      ctx.emit({ type: 'progress', step: 'revalidate', status: 'error', label: "Couldn't confirm the price" });
      return { agentId: this.id, status: 'FAILED', facts: [{ type: 'REVALIDATION_FAILED', data: {} }] }; // fail closed: never select an unverified price
    }
  }
}
