import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../observability/logger';

export interface MailMessage { to: string; subject: string; text: string; html?: string }

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined })
  : null;

export async function sendMail(m: MailMessage) {
  if (!transport) {
    // Dev only: no SMTP configured -> print the email so you can click the link.
    logger.warn({ to: m.to, subject: m.subject }, `[DEV MAIL - no SMTP configured]\n${m.text}`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, ...m });
}
