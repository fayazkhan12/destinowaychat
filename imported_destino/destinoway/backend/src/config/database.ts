import mongoose from 'mongoose';
import { env, isProd } from './env';
import { logger } from '../observability/logger';

export async function connectMongo() {
  mongoose.set('strictQuery', true);
  mongoose.set('sanitizeFilter', true); // blocks $-operator injection from user-supplied filters
  await mongoose.connect(env.MONGO_URI, {
    maxPoolSize: 30,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
    ignoreUndefined: true, // never persist `undefined` as null
    autoIndex: !isProd, // in prod build indexes via migration job
  });
  logger.info('mongo connected');
}
export const disconnectMongo = () => mongoose.disconnect();
