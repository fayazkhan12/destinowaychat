import { z } from 'zod';
import { FlightOfferSchema } from '../providers/types';
import type { Role } from '../security/rbac';

export const DOMAINS = ['TRAVEL', 'ECOMMERCE', 'FOOD', 'GROCERY', 'RESTAURANT', 'EVENTS', 'TICKETING', 'LOGISTICS', 'CAR_RENTAL', 'INSURANCE', 'HOME_SERVICES', 'REAL_ESTATE'] as const;
export type Domain = (typeof DOMAINS)[number];

export const CAPABILITIES = ['SEARCH', 'COMPARE', 'RECOMMEND', 'AVAILABILITY', 'PRICE', 'INVENTORY', 'BOOK', 'RESERVE', 'ADD_TO_CART', 'CHECKOUT', 'PAY', 'CANCEL', 'MODIFY', 'REFUND', 'TRACK', 'NOTIFY', 'SUPPORT'] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const LocationSchema = z.object({ city: z.string(), code: z.string().length(3), country: z.string().optional() });
export type Location = z.infer<typeof LocationSchema>;

const Bucket = z.object({ shortlist: z.array(z.unknown()).max(10).default([]), selectedId: z.string().optional() }).default({});

export const TripStateSchema = z.object({
  tripId: z.string(),
  userId: z.string(),
  origin: LocationSchema.optional(),
  destinations: z.array(LocationSchema).max(10).default([]),
  dates: z.object({ departure: z.string().optional(), return: z.string().optional(), durationDays: z.number().int().optional(), flexible: z.boolean().optional() }).default({}),
  travellers: z.object({ adults: z.number().int().min(1).max(9), children: z.number().int().min(0).max(9).default(0), infants: z.number().int().min(0).max(9).default(0), assumed: z.boolean().default(false) }).optional(),
  budget: z.object({ amount: z.number().positive(), currency: z.string().length(3).default('INR') }).optional(),
  preferences: z.record(z.unknown()).default({}),
  requestedServices: z.array(z.string()).max(20).default([]),
  flights: z.object({
    shortlist: z.array(FlightOfferSchema).max(10).default([]),
    selectedOfferId: z.string().optional(),
    lastSearchedAt: z.string().optional(),
    revalidation: z.object({ checkedAt: z.string(), priceType: z.enum(['LIVE', 'DEMO']), changed: z.boolean(), previousAmount: z.number(), currentAmount: z.number() }).optional(),
  }).default({}),
  hotels: Bucket, transfers: Bucket, activities: Bucket, // Phase 4
  itinerary: z.array(z.unknown()).max(60).default([]),
  totalPrice: z.object({ amount: z.number(), currency: z.string(), priceType: z.enum(['ESTIMATED', 'LIVE', 'CONFIRMED', 'DEMO']) }).optional(),
  currency: z.string().default('INR'),
  bookingStatus: z.enum(['NOT_STARTED', 'AWAITING_CONFIRMATION', 'IN_PROGRESS', 'CONFIRMED', 'FAILED', 'CANCELLED']).default('NOT_STARTED'),
  paymentStatus: z.enum(['NOT_STARTED', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED']).default('NOT_STARTED'),
  conversationSummary: z.string().max(2000).default(''),
  constraints: z.record(z.unknown()).default({}),
  approvals: z.array(z.object({ approvalId: z.string(), toolId: z.string(), status: z.enum(['PENDING', 'APPROVED', 'DECLINED', 'EXPIRED']), at: z.string() })).max(50).default([]),
  language: z.string().default('en'),
  pendingQuestion: z.enum(['origin', 'destination', 'date', 'travellers']).optional(),
});
export type TripState = z.infer<typeof TripStateSchema>;

export const INTENTS = ['PLAN_TRIP', 'SEARCH_FLIGHT', 'SEARCH_HOTEL', 'MODIFY_TRIP', 'SELECT_OPTION', 'BOOK', 'CANCEL', 'CONFIRM', 'DECLINE', 'FAQ', 'SMALLTALK', 'SUPPORT', 'OTHER'] as const;
export type Intent = (typeof INTENTS)[number];

export const UnderstandingSchema = z.object({
  intent: z.enum(INTENTS),
  language: z.string().max(12).default('en'),
  origin: z.string().max(60).optional(),
  destination: z.string().max(60).optional(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  durationDays: z.number().int().min(1).max(90).optional(),
  adults: z.number().int().min(1).max(9).optional(),
  children: z.number().int().min(0).max(9).optional(),
  infants: z.number().int().min(0).max(9).optional(),
  budgetAmount: z.number().positive().max(1e9).optional(),
  budgetCurrency: z.string().length(3).optional(),
  services: z.array(z.string().max(20)).max(10).default([]),
  sortPreference: z.enum(['cheapest', 'fastest', 'best_value']).optional(),
  selection: z.string().max(20).optional(),
});
export type Understanding = z.infer<typeof UnderstandingSchema>;

/** Structured result facts. The composer may ONLY state what is in facts (no invented prices/availability). */
export interface Fact { type: string; data: Record<string, unknown> }

export type OrchestratorEvent =
  | { type: 'progress'; step: string; status: 'start' | 'done' | 'error'; label: string; data?: Record<string, unknown> }
  | { type: 'token'; text: string }
  | { type: 'tripState'; state: unknown }
  | { type: 'approval'; approvalId: string; summary: string; amount?: number; currency?: string; expiresAt: string };
export type Emit = (e: OrchestratorEvent) => void;

export interface AgentTask { kind: 'search' | 'select'; service: string; selection?: string }
export interface AgentContext {
  userId: string; role: Role; emailVerified: boolean; tripId: string; requestId?: string;
  state: TripState; emit: Emit; sortPreference?: 'cheapest' | 'fastest' | 'best_value';
  callTool: <T = unknown>(toolId: string, input: unknown) => Promise<T>;
}
export interface AgentResult { agentId: string; status: 'OK' | 'PARTIAL' | 'FAILED'; statePatch?: (s: TripState) => TripState; facts: Fact[] }

export interface Agent {
  id: string;
  domain: Domain;
  services: string[];
  capabilities: Capability[];
  description: string;
  /** Slots that must be known before this agent can act (orchestrator asks at most ONE question). */
  missingSlots(state: TripState, task: AgentTask): Array<'origin' | 'destination' | 'date' | 'travellers'>;
  execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult>;
}
