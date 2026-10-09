import 'dotenv/config';
import { z } from 'zod';

const flag = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');
const optional = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    MONGO_URI: z.string().min(1),
    REDIS_URL: z.string().min(1),
    FRONTEND_ORIGIN: z.string().url(),
    COOKIE_DOMAIN: optional,
    JWT_ACCESS_SECRET: z.string().min(32),
    REFRESH_TOKEN_PEPPER: z.string().min(32),
    FIELD_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex chars'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    GOOGLE_REDIRECT_URI: optional,
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: optional,
    SMTP_PASS: optional,
    MAIL_FROM: z.string().default('Destinoway <no-reply@destinoway.com>'),
    LLM_PROVIDER: z.enum(['mock', 'anthropic', 'openai', 'gemini']).default('mock'),
    ANTHROPIC_API_KEY: optional,
    OPENAI_API_KEY: optional,
    GEMINI_API_KEY: optional,
    LLM_MODEL_FAST: optional,
    LLM_MODEL_MEDIUM: optional,
    LLM_MODEL_ADVANCED: optional,
    TRAVEL_PROVIDER_MODE: z.enum(['mock', 'production']).default('mock'),
    AKBAR_BASE_URL: optional,
    AKBAR_API_KEY: optional,
    AKBAR_API_KEY_HEADER: z.string().default('x-api-key'),
    AKBAR_USERNAME: optional,
    AKBAR_PASSWORD: optional,
    AKBAR_TIMEOUT_MS: z.coerce.number().int().default(15000),
    FEATURE_BOOKING_ENABLED: flag,
    // Number of reverse proxies / load balancers in front of the API. 0 = none (client IP = socket IP).
    // If this is wrong, clients can spoof X-Forwarded-For and dodge per-IP rate limits. Default: 1 in staging/production, 0 in development.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
    METRICS_TOKEN: optional,
    RUN_WORKERS_INLINE: flag,
  })
  .superRefine((e, ctx) => {
    const need = (key: keyof typeof e, why: string) => {
      if (!e[key]) ctx.addIssue({ code: 'custom', path: [key as string], message: `required: ${why}` });
    };
    if (e.LLM_PROVIDER === 'anthropic') need('ANTHROPIC_API_KEY', 'LLM_PROVIDER=anthropic');
    if (e.LLM_PROVIDER === 'openai') need('OPENAI_API_KEY', 'LLM_PROVIDER=openai');
    if (e.LLM_PROVIDER === 'gemini') need('GEMINI_API_KEY', 'LLM_PROVIDER=gemini');
    if (e.TRAVEL_PROVIDER_MODE === 'production') {
      need('AKBAR_BASE_URL', 'TRAVEL_PROVIDER_MODE=production');
      need('AKBAR_API_KEY', 'TRAVEL_PROVIDER_MODE=production');
    }
    if (e.NODE_ENV === 'production') {
      if (e.TRAVEL_PROVIDER_MODE === 'mock') ctx.addIssue({ code: 'custom', path: ['TRAVEL_PROVIDER_MODE'], message: 'mock mode is forbidden in production' });
      if (e.LLM_PROVIDER === 'mock') ctx.addIssue({ code: 'custom', path: ['LLM_PROVIDER'], message: 'mock LLM is forbidden in production' });
      if (/^0+$/.test(e.FIELD_ENCRYPTION_KEY)) ctx.addIssue({ code: 'custom', path: ['FIELD_ENCRYPTION_KEY'], message: 'default key is forbidden in production' });
      if (/change-me/.test(e.JWT_ACCESS_SECRET + e.REFRESH_TOKEN_PEPPER)) ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'placeholder secret in production' });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:\n' + parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
export const isTest = env.NODE_ENV === 'test';
export const allowedOrigins = [env.FRONTEND_ORIGIN];
