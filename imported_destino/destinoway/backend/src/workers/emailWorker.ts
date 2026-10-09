import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { sendMail, type MailMessage } from '../notifications/mailer';
import { logger } from '../observability/logger';

export function startEmailWorker() {
  const w = new Worker<MailMessage>('email', async (job) => sendMail(job.data), { connection: createRedisConnection(true), concurrency: 5 });
  w.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'email job failed'));
  return w;
}
