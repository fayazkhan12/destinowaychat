import { Schema, model, type InferSchemaType } from 'mongoose';

const sessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  refreshHash: { type: String, required: true, select: false },
  previousRefreshHash: { type: String, select: false },
  rotatedAt: { type: Date },
  device: { type: String, maxlength: 100 },
  browser: { type: String, maxlength: 100 },
  ip: { type: String, maxlength: 64 },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  revokedReason: { type: String, maxlength: 100 },
});
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // purge 30d after expiry
sessionSchema.index({ userId: 1, revokedAt: 1 });
export type SessionDoc = InferSchemaType<typeof sessionSchema>;
export const Session = model('Session', sessionSchema);
