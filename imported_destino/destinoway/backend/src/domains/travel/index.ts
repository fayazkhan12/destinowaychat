import { domainRegistry } from '../../orchestrator/registries/domainRegistry';
import { agentRegistry } from '../../orchestrator/registries/agentRegistry';
import { toolRegistry } from '../../tools/ToolRegistry';
import { FlightAgent } from '../../agents/FlightAgent';
import { buildFlightTools } from '../../tools/flightTools';
import { providerRegistry } from '../../providers';

/** A domain module = one register() call. Phase 4 adds HotelAgent/CabAgent/ActivityAgent/ItineraryAgent/BudgetAgent here. */
export function registerTravelDomain() {
  domainRegistry.register({ id: 'TRAVEL', displayName: 'Travel', services: ['FLIGHT', 'HOTEL', 'CAB', 'ACTIVITY', 'INSURANCE', 'VISA'], enabled: true });
  agentRegistry.register(new FlightAgent());
  for (const t of buildFlightTools(providerRegistry)) toolRegistry.register(t);
}
