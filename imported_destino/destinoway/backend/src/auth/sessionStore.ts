import { trusted } from 'mongoose';
import { redis } from '../config/redis';
import { Session } from '../models/Session';

const key = (sid: string) => `sess:${sid}`;

/** Redis holds a liveness flag per session so revocation takes effect instantly on every Node instance. */
export const sessionStore = {
  async markActive(sid: string, expiresAt: Date) {
    const ttl = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    await redis.set(key(sid), '1', 'EX', ttl);
  },
  async markRevoked(sids: string[]) {
    if (sids.length) await redis.del(...sids.map(key));
  },
  async isActive(sid: string): Promise<boolean> {
    if ((await redis.exists(key(sid))) === 1) return true;
    // Cache miss (e.g. Redis flushed): fall back to the source of truth and repopulate.
    const s = await Session.findOne({ sessionId: sid, revokedAt: null, expiresAt: trusted({ $gt: new Date() }) }).select('expiresAt').lean();
    if (!s) return false;
    await this.markActive(sid, s.expiresAt);
    return true;
  },
};
