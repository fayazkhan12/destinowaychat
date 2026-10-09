import { randomUUID } from 'node:crypto';
import { redis } from '../config/redis';

export interface Approval {
  approvalId: string; userId: string; tripId: string; toolId: string; inputHash: string;
  summary: string; amount?: number; currency?: string; createdAt: string; expiresAt: string;
}
export interface ApprovalStore {
  create(a: Omit<Approval, 'approvalId' | 'createdAt' | 'expiresAt'>, ttlSeconds?: number): Promise<Approval>;
  pendingForTrip(tripId: string, userId: string): Promise<Approval | null>;
  /** One-time use, atomically consumed. Returns true only if it exists AND matches exactly this user/trip/tool/input. */
  consume(approvalId: string, expect: { userId: string; tripId: string; toolId: string; inputHash: string }): Promise<boolean>;
  /** User said yes: mark as granted (still unspent) so a HIGH-risk tool can consume it. */
  grant(approvalId: string, userId: string): Promise<Approval | null>;
  decline(approvalId: string, userId: string): Promise<boolean>;
}

const k = (id: string) => `approval:${id}`;
const kp = (tripId: string) => `approval:pending:${tripId}`;
const kg = (id: string) => `approval:granted:${id}`;

export const redisApprovalStore: ApprovalStore = {
  async create(a, ttl = 600) {
    const approval: Approval = { ...a, approvalId: randomUUID(), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
    await redis.multi().set(k(approval.approvalId), JSON.stringify(approval), 'EX', ttl).set(kp(a.tripId), approval.approvalId, 'EX', ttl).exec();
    return approval;
  },
  async pendingForTrip(tripId, userId) {
    const id = await redis.get(kp(tripId));
    if (!id) return null;
    const raw = await redis.get(k(id));
    if (!raw) return null;
    const a = JSON.parse(raw) as Approval;
    return a.userId === userId ? a : null;
  },
  async grant(id, userId) {
    const raw = await redis.get(k(id));
    if (!raw) return null;
    const a = JSON.parse(raw) as Approval;
    if (a.userId !== userId) return null;
    const ttl = Math.max(1, Math.floor((new Date(a.expiresAt).getTime() - Date.now()) / 1000));
    await redis.multi().set(kg(id), '1', 'EX', ttl).del(kp(a.tripId)).exec();
    return a;
  },
  async decline(id, userId) {
    const raw = await redis.get(k(id));
    if (!raw) return false;
    const a = JSON.parse(raw) as Approval;
    if (a.userId !== userId) return false;
    await redis.multi().del(k(id)).del(kg(id)).del(kp(a.tripId)).exec();
    return true;
  },
  async consume(id, expect) {
    const granted = await redis.getdel(kg(id)); // atomic one-time use
    if (!granted) return false;
    const raw = await redis.getdel(k(id));
    if (!raw) return false;
    const a = JSON.parse(raw) as Approval;
    return a.userId === expect.userId && a.tripId === expect.tripId && a.toolId === expect.toolId && a.inputHash === expect.inputHash;
  },
};

/** In-memory implementation for unit tests. */
export function createMemoryApprovalStore(): ApprovalStore & { _granted: Set<string> } {
  const items = new Map<string, Approval>(); const granted = new Set<string>(); const pending = new Map<string, string>();
  return {
    _granted: granted,
    async create(a) { const ap: Approval = { ...a, approvalId: randomUUID(), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString() }; items.set(ap.approvalId, ap); pending.set(a.tripId, ap.approvalId); return ap; },
    async pendingForTrip(t, u) { const id = pending.get(t); const a = id ? items.get(id) : undefined; return a && a.userId === u ? a : null; },
    async grant(id, u) { const a = items.get(id); if (!a || a.userId !== u) return null; granted.add(id); pending.delete(a.tripId); return a; },
    async decline(id, u) { const a = items.get(id); if (!a || a.userId !== u) return false; items.delete(id); granted.delete(id); return true; },
    async consume(id, e) { if (!granted.delete(id)) return false; const a = items.get(id); items.delete(id); return !!a && a.userId === e.userId && a.tripId === e.tripId && a.toolId === e.toolId && a.inputHash === e.inputHash; },
  };
}
