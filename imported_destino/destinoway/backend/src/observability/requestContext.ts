import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { requestStore } from './logger';

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  const corr = req.header('x-correlation-id');
  const correlationId = corr && SAFE_ID.test(corr) ? corr : requestId;
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);
  req.requestId = requestId;
  requestStore.run({ requestId, correlationId }, next);
};
