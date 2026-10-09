import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../observability/logger';
import { isProd } from '../config/env';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err: err.message, code: err.code }, 'app error');
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, requestId: req.requestId } });
  }
  if ((err as { type?: string }).type === 'entity.too.large') return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' } });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON' } });
  logger.error({ err: (err as Error).message, stack: isProd ? undefined : (err as Error).stack }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong', requestId: req.requestId } }); // never leak internals
};
