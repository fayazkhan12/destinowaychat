import { Types } from 'mongoose';
import { Trip, TripStateModel } from '../models/Trip';
import { Conversation, Message } from '../models/Conversation';
import { TripStateSchema, type TripState } from '../orchestrator/types';
import { AppError, notFound } from '../utils/errors';
import { stripNullish } from '../utils/stripNullish';
import { logger } from '../observability/logger';

export const newState = (tripId: string, userId: string): TripState => TripStateSchema.parse({ tripId, userId });

/** Strip server-only fields (provider handles) before sending state to the browser. */
export function toClientState(s: TripState) {
  return {
    ...s,
    flights: { ...s.flights, shortlist: s.flights.shortlist.map(({ providerRef: _r, provider: _p, ...rest }) => rest) },
  };
}

export const tripStateService = {
  async createTrip(userId: string): Promise<{ tripId: string; conversationId: string; state: TripState; version: number }> {
    const trip = await Trip.create({ userId });
    const convo = await Conversation.create({ userId, tripId: trip._id, title: 'New trip' });
    await trip.updateOne({ conversationId: convo._id });
    const state = newState(String(trip._id), userId);
    await TripStateModel.create({ tripId: trip._id, userId, state: stripNullish(state), version: 0 });
    return { tripId: String(trip._id), conversationId: String(convo._id), state, version: 0 };
  },

  /**
   * Ownership is enforced in the query itself (IDOR protection).
   * Legacy documents written by older builds may contain `null` for optional fields; stripNullish makes them valid again.
   */
  async load(tripId: string, userId: string): Promise<{ state: TripState; version: number; conversationId: string }> {
    if (!Types.ObjectId.isValid(tripId)) throw notFound('Trip not found');
    const [doc, trip] = await Promise.all([
      TripStateModel.findOne({ tripId, userId }).lean(),
      Trip.findOne({ _id: tripId, userId }).select('conversationId').lean(),
    ]);
    if (!doc || !trip) throw notFound('Trip not found');
    const parsed = TripStateSchema.safeParse(stripNullish(doc.state));
    if (!parsed.success) {
      logger.error({ tripId, issues: parsed.error.issues.slice(0, 5) }, 'STATE_CORRUPT');
      throw new AppError(500, 'STATE_CORRUPT', 'Trip state is invalid');
    }
    return { state: parsed.data, version: doc.version, conversationId: String(trip.conversationId) };
  },

  /** Optimistic concurrency: fails if another writer bumped the version. State is validated and null-free before it is persisted. */
  async save(state: TripState, expectedVersion: number): Promise<number> {
    const valid = stripNullish(TripStateSchema.parse(state));
    const r = await TripStateModel.updateOne(
      { tripId: valid.tripId, userId: valid.userId, version: expectedVersion },
      { $set: { state: valid }, $inc: { version: 1 } },
    );
    if (r.matchedCount !== 1) throw new AppError(409, 'STATE_CONFLICT', 'Trip was updated elsewhere');
    return expectedVersion + 1;
  },

  async listTrips(userId: string) {
    return Trip.find({ userId }).sort({ updatedAt: -1 }).limit(50).select('title status updatedAt').lean();
  },

  async appendMessage(conversationId: string, userId: string, role: 'user' | 'assistant', content: string, meta?: Record<string, unknown>) {
    await Message.create({ conversationId, userId, role, content: content.slice(0, 8000), meta });
    await Conversation.updateOne({ _id: conversationId }, { $inc: { messageCount: 1 }, $set: { lastMessageAt: new Date() } });
  },

  async recentMessages(conversationId: string, userId: string, limit = 20) {
    const rows = await Message.find({ conversationId, userId }).sort({ createdAt: -1 }).limit(limit).select('role content createdAt').lean();
    return rows.reverse();
  },

  async setTitle(tripId: string, title: string) {
    await Trip.updateOne({ _id: tripId }, { $set: { title: title.slice(0, 140) } });
  },
};
