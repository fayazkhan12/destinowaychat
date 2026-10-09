import { randomUUID } from 'node:crypto';
import { AuditLog } from '../models/AuditLog';
import { logger, sanitizeForLog, requestStore } from '../observability/logger';
import { sha256 } from '../utils/crypto';

export interface AuditEvent {
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  actorId?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}
export interface AuditSink { record(e: AuditEvent): Promise<void> }

export const auditRepository: AuditSink = {
  async record(e) {
    try {
      const eventId = randomUUID();
      const metadata = sanitizeForLog(e.metadata ?? {});
      const requestId = requestStore.getStore()?.requestId;
      const integrityHash = sha256(JSON.stringify({ eventId, ...e, metadata }));
      await AuditLog.create({ ...e, eventId, metadata, requestId, integrityHash });
    } catch (err) {
      // Audit failures must be loud but must not take the request down.
      logger.error({ err: (err as Error).message, action: e.action }, 'AUDIT WRITE FAILED');
    }
  },
};
