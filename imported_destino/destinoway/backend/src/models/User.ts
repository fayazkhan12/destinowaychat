import { Schema, model, type InferSchemaType } from 'mongoose';
import { ROLES } from '../security/rbac';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    passwordHash: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ROLES, default: 'USER', index: true },
    emailVerified: { type: Boolean, default: false },
    phoneEncrypted: { type: String, select: false }, // AES-256-GCM (see utils/crypto)
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    disabledAt: { type: Date },
  },
  { timestamps: true },
);
export type UserDoc = InferSchemaType<typeof userSchema> & { _id: import('mongoose').Types.ObjectId };
export const User = model('User', userSchema);
