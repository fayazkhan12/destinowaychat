import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

const key = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');

/** AES-256-GCM field encryption for sensitive data (phone, passport, ...). Format: v1.iv.tag.ct (base64url) */
export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function decryptField(blob: string): string {
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('bad ciphertext');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');
export const hmacToken = (token: string) => createHmac('sha256', env.REFRESH_TOKEN_PEPPER).update(token).digest('hex');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
