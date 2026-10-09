import { trusted } from 'mongoose';
import { Session } from '../models/Session';

export const sessionRepository = {
  create: (data: Record<string, unknown>) => Session.create(data),
  findBySessionId: (sessionId: string) => Session.findOne({ sessionId }).select('+refreshHash +previousRefreshHash'),
  listActiveForUser: (userId: string) =>
    Session.find({ userId, revokedAt: null, expiresAt: trusted({ $gt: new Date() }) }).sort({ lastActiveAt: -1 }).limit(50).lean(),
  revoke: (sessionId: string, reason: string) =>
    Session.updateOne({ sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } }),
  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string) {
    const filter: Record<string, unknown> = { userId, revokedAt: null };
    if (exceptSessionId) filter.sessionId = trusted({ $ne: exceptSessionId });
    const sessions = await Session.find(filter).select('sessionId').lean();
    await Session.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } });
    return sessions.map((s) => s.sessionId);
  },
};
