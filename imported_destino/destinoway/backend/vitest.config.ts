import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'], exclude: ['tests/integration/**', 'node_modules/**'], setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test', MONGO_URI: 'mongodb://localhost:27017/test', REDIS_URL: 'redis://localhost:6379', FRONTEND_ORIGIN: 'http://localhost:3000',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123', REFRESH_TOKEN_PEPPER: 'test-pepper-test-pepper-test-pepper-12',
      FIELD_ENCRYPTION_KEY: '1111111111111111111111111111111111111111111111111111111111111111', LLM_MODEL_FAST: 'test-fast-model', GEMINI_API_KEY: 'unit-test-key', ANTHROPIC_API_KEY: 'unit-test-key', LLM_PROVIDER: 'mock', TRAVEL_PROVIDER_MODE: 'mock', LOG_LEVEL: 'fatal',
    },
  },
});
