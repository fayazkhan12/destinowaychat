import http from 'node:http';
import { env } from './config/env';
import { connectMongo, disconnectMongo } from './config/database';
import { redis } from './config/redis';
import { logger } from './observability/logger';
import { buildApp } from './app';
import { buildOrchestrator } from './orchestrator/bootstrap';
import { attachSocketGateway } from './realtime/socket';
import { eventBus } from './events/eventBus';
import { startEmailWorker } from './workers/emailWorker';

async function main() {
  await connectMongo();
  await eventBus.start();
  const orchestrator = buildOrchestrator();
  const server = http.createServer(buildApp(orchestrator));
  const io = attachSocketGateway(server, orchestrator);
  if (env.RUN_WORKERS_INLINE) startEmailWorker(); // dev convenience; in prod run `npm run start:worker` separately
  server.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV, llm: env.LLM_PROVIDER, travelProviderMode: env.TRAVEL_PROVIDER_MODE }, 'Destinoway API listening'));

  let closing = false;
  const shutdown = async (sig: string) => {
    if (closing) return; closing = true;
    logger.info({ sig }, 'shutting down');
    server.close(); io.close();
    await Promise.allSettled([eventBus.stop(), disconnectMongo(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (e) => logger.error({ err: String(e) }, 'unhandledRejection'));
}
main().catch((e) => { logger.fatal({ err: String(e) }, 'startup failed'); process.exit(1); });
