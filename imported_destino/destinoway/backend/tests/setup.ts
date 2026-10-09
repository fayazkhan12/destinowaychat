import { vi } from 'vitest';
// Unit tests must never need Redis/Mongo.
vi.mock('../src/config/redis', () => ({ redis: { publish: async () => 0, get: async () => null, set: async () => 'OK' }, createRedisConnection: () => ({}) }));
vi.mock('../src/events/eventBus', () => ({ eventBus: { publish: async () => undefined, on: () => () => undefined } }));
