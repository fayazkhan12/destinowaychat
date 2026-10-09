import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../utils/errors';

export const validateBody = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) return next(badRequest('Invalid request', 'VALIDATION_ERROR', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
  req.body = r.data;
  next();
};
export const validateQuery = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(badRequest('Invalid query', 'VALIDATION_ERROR', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
  (req as unknown as { validatedQuery: unknown }).validatedQuery = r.data;
  next();
};
