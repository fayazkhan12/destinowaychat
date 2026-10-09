import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allowedOrigins, env, isProd } from './config/env';
import { requestContext } from './observability/requestContext';
import { httpLatency } from './observability/metrics';
import { logger } from './observability/logger';
import { csrfGuard, sanitizeInput } from './middlewares/security';
import { rateLimit } from './middlewares/rateLimit';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { authRouter } from './routes/auth';
import { meRouter } from './routes/me';
import { adminRouter } from './routes/admin';
import { healthRouter } from './routes/health';
import { buildTripsRouter } from './routes/trips';
import type { UniversalAIOrchestrator } from './orchestrator/UniversalAIOrchestrator';

export function buildApp(orchestrator: UniversalAIOrchestrator) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS ?? (isProd ? 1 : 0)); // req.ip must be the real client IP; hop count must match your infra (see TRUST_PROXY_HOPS)

  app.use(requestContext);
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } }, // pure JSON API: nothing may load
    crossOriginResourcePolicy: { policy: 'same-site' }, referrerPolicy: { policy: 'no-referrer' },
    hsts: isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  }));
  app.use(cors({ origin: (o, cb) => cb(null, !o || allowedOrigins.includes(o)), credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['content-type', 'x-requested-with', 'x-request-id', 'authorization'], maxAge: 600 }));
  app.use(compression());
  app.use((req, res, next) => { // request logging + latency (no bodies, no headers => no secrets)
    const end = httpLatency.startTimer();
    res.on('finish', () => {
      const route = (req.route?.path as string | undefined) ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      end({ method: req.method, route, status: res.statusCode });
      logger.info({ method: req.method, route, status: res.statusCode }, 'request');
    });
    next();
  });
  app.use(healthRouter);
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  app.use(sanitizeInput);

  if (!isProd) {
    const spec = parseYaml(readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf8'));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec)); // API docs only exposed outside prod/staging
  }

  const v1 = express.Router();
  v1.use(csrfGuard);
  v1.use(rateLimit('ipGlobal'));
  v1.use('/auth', authRouter);
  v1.use(meRouter);
  v1.use(buildTripsRouter(orchestrator));
  v1.use('/admin', adminRouter);
  app.use('/api/v1', v1); // /api/v2 can be mounted beside it without breaking v1 clients

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
