import { Router } from 'express';
import { trusted } from 'mongoose';
import { ah } from '../middlewares/asyncHandler';
import { authenticate, requirePermission } from '../middlewares/authenticate';
import { rateLimit } from '../middlewares/rateLimit';
import { validateBody, validateQuery } from '../middlewares/validate';
import { pageQuery, roleBody, idParam } from '../validators/api';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { toolRegistry } from '../tools/ToolRegistry';
import { agentRegistry } from '../orchestrator/registries/agentRegistry';
import { domainRegistry } from '../orchestrator/registries/domainRegistry';
import { providerRegistry } from '../providers';
import { sessionRepository } from '../repositories/sessionRepository';
import { sessionStore } from '../auth/sessionStore';
import { auditRepository } from '../repositories/auditRepository';
import { badRequest, forbidden, notFound } from '../utils/errors';

export const adminRouter = Router();
adminRouter.use(authenticate, rateLimit('admin'));

adminRouter.get('/users', requirePermission('admin:users:read'), validateQuery(pageQuery), ah(async (req, res) => {
  const { limit } = (req as unknown as { validatedQuery: { limit: number } }).validatedQuery;
  const users = await User.find().sort({ createdAt: -1 }).limit(limit).select('email name role emailVerified createdAt lastLoginAt disabledAt').lean();
  res.json({ users });
}));

adminRouter.get('/audit-logs', requirePermission('admin:audit:read'), validateQuery(pageQuery), ah(async (req, res) => {
  const { limit, before } = (req as unknown as { validatedQuery: { limit: number; before?: string } }).validatedQuery;
  const logs = await AuditLog.find(before ? { createdAt: trusted({ $lt: new Date(before) }) } : {}).sort({ createdAt: -1 }).limit(limit).select('-__v').lean();
  res.json({ logs });
}));

// Role changes: SUPER_ADMIN only, audited, and force-logout the target so the new role applies immediately.
adminRouter.patch('/users/:id/role', requirePermission('admin:roles:write'), rateLimit('highRisk'), validateBody(roleBody), ah(async (req, res) => {
  const id = idParam.safeParse(req.params['id']); if (!id.success) throw badRequest('Invalid id');
  if (id.data === req.auth!.userId) throw forbidden('You cannot change your own role');
  const u = await User.findById(id.data); if (!u) throw notFound('User not found');
  const before = u.role;
  await u.updateOne({ $set: { role: req.body.role } });
  const sids = await sessionRepository.revokeAllForUser(id.data, 'ROLE_CHANGED');
  await sessionStore.markRevoked(sids);
  await auditRepository.record({ action: 'ROLE_CHANGED', outcome: 'SUCCESS', actorId: req.auth!.userId, actorRole: req.auth!.role, targetType: 'user', targetId: id.data, ip: req.ip, metadata: { from: before, to: req.body.role } });
  res.json({ ok: true });
}));

adminRouter.get('/system', requirePermission('admin:providers:read'), ah(async (_req, res) => {
  res.json({
    domains: domainRegistry.enabled(),
    agents: agentRegistry.list().map(({ id, domain, services, capabilities, description }) => ({ id, domain, services, capabilities, description })),
    tools: toolRegistry.describe(), // metadata only - never handlers or secrets
    providers: await providerRegistry.health(),
  });
}));
