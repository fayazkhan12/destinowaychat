import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(10, 'At least 10 characters').max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use letters and numbers');

export const registerBody = z.object({ name: z.string().trim().min(1).max(100), email, password }).strict();
export const loginBody = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const verifyEmailBody = z.object({ token: z.string().min(20).max(200) }).strict();
export const forgotBody = z.object({ email }).strict();
export const resetBody = z.object({ token: z.string().min(20).max(200), password }).strict();
