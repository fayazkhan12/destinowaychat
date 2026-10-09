import { Router } from 'express';
import mongoose from 'mongoose';
import { redis } from '../config/redis';
import { registry } from '../observability/metrics';
import { env } from '../config/env';
import { safeEqual } from '../utils/crypto';

export const healthRouter = Router();
healthRouter.get('/health', (_req, res) => res.json({ status: 'ok' }));
healthRouter.get('/ready', async (_req, res) => {
  const mongo = mongoose.connection.readyState === 1;
  const red = await redis.ping().then((p) => p === 'PONG').catch(() => false);
  res.status(mongo && red ? 200 : 503).json({ mongo, redis: red });
});
// Prometheus / OpenTelemetry-collector scrape endpoint, protected by a bearer token.
healthRouter.get('/metrics', async (req, res) => {
  const tok = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  if (!env.METRICS_TOKEN || !safeEqual(tok, env.METRICS_TOKEN)) return res.status(401).end();
  res.setHeader('content-type', registry.contentType);
  res.send(await registry.metrics());
});
