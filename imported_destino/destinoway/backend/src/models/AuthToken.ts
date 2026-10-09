import { Schema, model } from 'mongoose';

const authTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['EMAIL_VERIFY', 'PASSWORD_RESET'], required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  usedAt: { type: Date },
});
export const AuthToken = model('AuthToken', authTokenSchema);
