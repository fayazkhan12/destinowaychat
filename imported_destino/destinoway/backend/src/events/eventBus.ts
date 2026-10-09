import { randomUUID } from 'node:crypto';
import { createRedisConnection, redis } from '../config/redis';
import { logger } from '../observability/logger';

export const EVENT_TYPES = [
  'USER_MESSAGE', 'AI_RESPONSE', 'FLIGHT_SEARCH_STARTED', 'FLIGHT_SEARCH_COMPLETED', 'HOTEL_SEARCH_STARTED', 'HOTEL_SEARCH_COMPLETED',
  'PRICE_CHANGED', 'BOOKING_CREATED', 'PAYMENT_STARTED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'REFUND_CREATED',
  'APPROVAL_REQUESTED', 'SECURITY_ALERT',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface DomainEvent<T = Record<string, unknown>> { id: string; type: EventType; userId?: string; tripId?: string; payload: T; at: string; requestId?: string }
type Handler = (e: DomainEvent) => void | Promise<void>;

const CHANNEL = 'dw:events';

/**
 * Redis pub/sub event bus. Every Node instance receives every event, so a worker on instance A can notify a socket connected to instance B.
 * (Use Redis Streams / a broker like NATS/Kafka if you later need durable replay.)
 */
class EventBus {
  private handlers = new Map<string, Set<Handler>>();
  private sub?: ReturnType<typeof createRedisConnection>;

  async start() {
    this.sub = createRedisConnection();
    await this.sub.subscribe(CHANNEL);
    this.sub.on('message', (_c, msg) => {
      try { this.dispatch(JSON.parse(msg) as DomainEvent); } catch (e) { logger.warn({ err: (e as Error).message }, 'bad event'); }
    });
  }
  on(type: EventType | '*', h: Handler) {
    const set = this.handlers.get(type) ?? new Set();
    set.add(h); this.handlers.set(type, set);
    return () => set.delete(h);
  }
  async publish<T extends Record<string, unknown>>(type: EventType, e: { userId?: string; tripId?: string; payload?: T; requestId?: string }) {
    const ev: DomainEvent = { id: randomUUID(), type, userId: e.userId, tripId: e.tripId, payload: e.payload ?? {}, at: new Date().toISOString(), requestId: e.requestId };
    await redis.publish(CHANNEL, JSON.stringify(ev));
  }
  private dispatch(ev: DomainEvent) {
    for (const key of [ev.type, '*']) for (const h of this.handlers.get(key) ?? []) Promise.resolve(h(ev)).catch((err) => logger.error({ err: String(err), type: ev.type }, 'event handler failed'));
  }
  async stop() { await this.sub?.quit(); }
}
export const eventBus = new EventBus();
