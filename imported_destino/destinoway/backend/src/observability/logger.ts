import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../config/env';

export interface RequestStore { requestId: string; correlationId: string; userId?: string }
export const requestStore = new AsyncLocalStorage<RequestStore>();

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'destinoway-api', env: env.NODE_ENV },
  mixin: () => requestStore.getStore() ?? {},
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
      '*.password', '*.passwordHash', '*.token', '*.accessToken', '*.refreshToken',
      '*.apiKey', '*.secret', '*.authorization', '*.cookie', '*.cardNumber', '*.cvv',
    ],
    censor: '[REDACTED]',
  },
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } } : undefined,
});

const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|cvv|card|otp/i;
/** Deep-sanitize any object before logging / audit storage. */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitizeForLog(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : sanitizeForLog(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '…';
  return value;
}
