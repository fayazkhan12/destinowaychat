import { Schema, model } from 'mongoose';

const tripSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'New trip', maxlength: 140 },
  status: { type: String, enum: ['PLANNING', 'READY_TO_BOOK', 'BOOKED', 'COMPLETED', 'CANCELLED'], default: 'PLANNING' },
  domains: { type: [String], default: ['TRAVEL'] },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
}, { timestamps: true });
tripSchema.index({ userId: 1, updatedAt: -1 });
export const Trip = model('Trip', tripSchema);

// TripState is versioned (optimistic concurrency) and bounded: large search results live in Redis, not here.
const tripStateSchema = new Schema({
  tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  version: { type: Number, default: 0 },
  state: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });
export const TripStateModel = model('TripState', tripStateSchema);
