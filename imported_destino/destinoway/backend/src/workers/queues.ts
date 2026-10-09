import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import type { MailMessage } from '../notifications/mailer';

const connection = createRedisConnection(true);
const defaultJobOptions = { attempts: 5, backoff: { type: 'exponential' as const, delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 };

export const emailQueue = new Queue<MailMessage>('email', { connection, defaultJobOptions });
// Reserved queues for later phases (declared so the topology is stable):
export const reconciliationQueue = new Queue('reconciliation', { connection, defaultJobOptions });
export const notificationQueue = new Queue('notifications', { connection, defaultJobOptions });
