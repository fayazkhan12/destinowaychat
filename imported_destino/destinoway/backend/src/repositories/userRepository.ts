import { User } from '../models/User';

export const userRepository = {
  findByEmail: (email: string) => User.findOne({ email: email.toLowerCase() }).select('+passwordHash'),
  findById: (id: string) => User.findById(id),
  findByGoogleId: (googleId: string) => User.findOne({ googleId }),
  create: (data: Record<string, unknown>) => User.create(data),
};
