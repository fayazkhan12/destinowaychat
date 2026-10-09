import { env } from '../config/env';
import { ProviderRegistry } from './ProviderRegistry';
import { AkbarTravelProvider } from './akbar/AkbarTravelProvider';
import { MockFlightProvider } from './mockFlightProvider';

/** MOCK MODE and PRODUCTION MODE are strictly separated: in production the mock provider is never registered. */
export function buildProviderRegistry(): ProviderRegistry {
  const reg = new ProviderRegistry();
  if (env.TRAVEL_PROVIDER_MODE === 'production') reg.register(new AkbarTravelProvider());
  else reg.register(new MockFlightProvider());
  // Future: reg.register(new ProviderB()); reg.register(new ProviderC());
  return reg;
}
export const providerRegistry = buildProviderRegistry();
