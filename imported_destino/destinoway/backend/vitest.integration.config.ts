import { defineConfig } from 'vitest/config';
// Needs real MongoDB + Redis (docker compose up -d, or CI service containers).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000, hookTimeout: 30_000, fileParallelism: false,
    env: {
      NODE_ENV: 'test', LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'fatal',
      MONGO_URI: process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27017/destinoway_test',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15',
      FRONTEND_ORIGIN: 'http://localhost:3000',
      JWT_ACCESS_SECRET: 'integration-secret-integration-secret-1234', REFRESH_TOKEN_PEPPER: 'integration-pepper-integration-pepper-123',
      FIELD_ENCRYPTION_KEY: '2222222222222222222222222222222222222222222222222222222222222222',
      TRUST_PROXY_HOPS: '1', // tests simulate distinct client IPs via X-Forwarded-For
      LLM_PROVIDER: 'mock', TRAVEL_PROVIDER_MODE: 'mock', RUN_WORKERS_INLINE: 'false',
    },
  },
});
