import { Schema, model } from 'mongoose';

const preferenceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  memoryEnabled: { type: Boolean, default: true },
  preferredAirlines: { type: [String], default: [] },
  hotelCategory: { type: String, enum: ['budget', 'standard', 'premium', 'luxury'] },
  budgetPreference: { type: String, enum: ['lowest', 'balanced', 'comfort'] },
  seatPreference: { type: String, enum: ['window', 'aisle', 'any'] },
  travelStyle: { type: String, maxlength: 60 },
  language: { type: String, maxlength: 10 },
}, { timestamps: true });
export const Preference = model('Preference', preferenceSchema);
