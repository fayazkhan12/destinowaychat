import { Schema, model } from 'mongoose';

const conversationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tripId: { type: Schema.Types.ObjectId, ref: 'Trip', index: true },
  title: { type: String, maxlength: 140 },
  status: { type: String, enum: ['AI', 'HUMAN_HANDOFF', 'CLOSED'], default: 'AI' },
  assignedAgentId: { type: Schema.Types.ObjectId, ref: 'User' },
  summary: { type: String, maxlength: 2000 },
  messageCount: { type: Number, default: 0 },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });
conversationSchema.index({ userId: 1, lastMessageAt: -1 });
export const Conversation = model('Conversation', conversationSchema);

// Messages live in their own collection -> conversation documents never grow unbounded.
const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['user', 'assistant', 'system', 'human_agent'], required: true },
  content: { type: String, required: true, maxlength: 8000 },
  meta: { type: Schema.Types.Mixed }, // intent, language, agents run, latency, token usage
  createdAt: { type: Date, default: Date.now },
});
messageSchema.index({ conversationId: 1, createdAt: 1 });
export const Message = model('Message', messageSchema);
