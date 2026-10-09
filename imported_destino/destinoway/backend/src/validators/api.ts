import { z } from 'zod';
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
export const chatBody = z.object({ tripId: objectId.optional(), text: z.string().min(1).max(2000) }).strict();
export const preferencesBody = z.object({
  memoryEnabled: z.boolean().optional(),
  preferredAirlines: z.array(z.string().max(40)).max(10).optional(),
  hotelCategory: z.enum(['budget', 'standard', 'premium', 'luxury']).optional(),
  budgetPreference: z.enum(['lowest', 'balanced', 'comfort']).optional(),
  seatPreference: z.enum(['window', 'aisle', 'any']).optional(),
  travelStyle: z.string().max(60).optional(),
  language: z.string().max(10).optional(),
}).strict();
export const roleBody = z.object({ role: z.enum(['USER', 'TRAVEL_AGENT', 'SUPPORT_AGENT', 'ADMIN', 'SUPER_ADMIN']) }).strict();
export const idParam = objectId;
export const sessionIdParam = z.string().uuid();
export const pageQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), before: z.string().datetime().optional() });
