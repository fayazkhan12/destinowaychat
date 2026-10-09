import { connectMongo } from '../config/database';
import { startEmailWorker } from './emailWorker';
import { logger } from '../observability/logger';

// Standalone worker process: `npm run start:worker` (scale independently from the API).
(async () => {
  await connectMongo();
  startEmailWorker();
  logger.info('workers started');
})().catch((e) => { logger.fatal(e); process.exit(1); });
