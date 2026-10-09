import type { Capability, Intent } from '../types';
import { CAPABILITIES } from '../types';

export interface CapabilityInfo { id: Capability; requiresConfirmation: boolean }
const CONFIRM: Capability[] = ['BOOK', 'RESERVE', 'CHECKOUT', 'PAY', 'CANCEL', 'REFUND', 'MODIFY'];

/** Capabilities are domain-neutral verbs. The orchestrator selects agents by (domain, service, capability), never by name. */
class CapabilityRegistry {
  private intentMap = new Map<Intent, Capability[]>();
  constructor() {
    this.intentMap.set('PLAN_TRIP', ['SEARCH', 'COMPARE', 'RECOMMEND', 'PRICE']);
    this.intentMap.set('SEARCH_FLIGHT', ['SEARCH', 'COMPARE', 'RECOMMEND', 'PRICE']);
    this.intentMap.set('SEARCH_HOTEL', ['SEARCH', 'COMPARE', 'RECOMMEND', 'PRICE']);
    this.intentMap.set('MODIFY_TRIP', ['SEARCH', 'COMPARE', 'RECOMMEND', 'PRICE']);
    this.intentMap.set('SELECT_OPTION', ['AVAILABILITY', 'PRICE']);
    this.intentMap.set('BOOK', ['BOOK']);
    this.intentMap.set('CANCEL', ['CANCEL']);
  }
  all(): CapabilityInfo[] { return CAPABILITIES.map((id) => ({ id, requiresConfirmation: CONFIRM.includes(id) })); }
  forIntent(i: Intent): Capability[] { return this.intentMap.get(i) ?? []; }
  /** Domains can extend the intent->capability map without touching the orchestrator. */
  mapIntent(i: Intent, caps: Capability[]) { this.intentMap.set(i, caps); }
}
export const capabilityRegistry = new CapabilityRegistry();
