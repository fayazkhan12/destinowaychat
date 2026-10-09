import { z } from 'zod';
import { defineTool } from './types';
import { FlightOfferSchema } from '../providers/types';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import { searchesTotal } from '../observability/metrics';

const Search = z.object({ origin: z.string().length(3), destination: z.string().length(3), departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), adults: z.number().int().min(1).max(9), children: z.number().int().min(0).max(9).default(0), infants: z.number().int().min(0).max(9).default(0), currency: z.string().length(3).default('INR') });
const Money = z.object({ amount: z.number(), currency: z.string() });

export const buildFlightTools = (providers: ProviderRegistry) => [
  defineTool({
    toolId: 'searchFlights', description: 'Search live flights across all configured providers', riskLevel: 'LOW',
    requiredPermissions: ['flight:search'], allowedAgents: ['FlightAgent'], timeoutMs: 40_000,
    inputSchema: Search,
    outputSchema: z.object({ offers: z.array(FlightOfferSchema), statuses: z.array(z.object({ provider: z.string(), ok: z.boolean(), error: z.string().optional(), count: z.number().optional(), breaker: z.string() })) }),
    handler: async (input, ctx) => { searchesTotal.inc({ service: 'FLIGHT' }); return providers.searchFlights(input, ctx.requestId); },
  }),
  defineTool({
    toolId: 'revalidateFlightPrice', description: 'Re-check price and availability of a specific offer with its provider', riskLevel: 'LOW',
    requiredPermissions: ['flight:search'], allowedAgents: ['FlightAgent'], timeoutMs: 30_000,
    inputSchema: z.object({ offer: FlightOfferSchema }),
    outputSchema: z.object({ available: z.boolean(), previousPrice: Money, currentPrice: Money, changed: z.boolean(), cancellationRules: z.string().optional(), checkedAt: z.string(), priceType: z.enum(['LIVE', 'DEMO']) }),
    handler: async ({ offer }, ctx) => providers.revalidate(offer, ctx.requestId),
  }),
  // HIGH/CRITICAL tools (createFlightBooking, cancelFlightBooking, createPayment) are added in Phase 5 behind the approval gate.
];
