import { Schema, model } from 'mongoose';

/** Append-only. Update/delete operations are blocked at the ODM layer; in production also ship to WORM storage / SIEM. */
const auditSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    action: { type: String, required: true, index: true },
    outcome: { type: String, enum: ['SUCCESS', 'FAILURE', 'DENIED'], required: true },
    actorId: { type: String, index: true },
    actorRole: { type: String },
    targetType: { type: String },
    targetId: { type: String },
    ip: { type: String },
    requestId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, immutable: true, index: true },
    integrityHash: { type: String, required: true },
  },
  { strict: true },
);
auditSchema.index({ actorId: 1, createdAt: -1 });
const blocked = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const;
for (const op of blocked) {
  auditSchema.pre(op as 'updateOne', function () { throw new Error('AuditLog is immutable'); });
}
auditSchema.pre('save', function (next) { if (!this.isNew) return next(new Error('AuditLog is immutable')); next(); });
export const AuditLog = model('AuditLog', auditSchema);
