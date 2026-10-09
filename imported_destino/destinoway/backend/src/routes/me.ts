import { Router } from 'express';
import { ah } from '../middlewares/asyncHandler';
import { authenticate, requirePermission } from '../middlewares/authenticate';
import { rateLimit } from '../middlewares/rateLimit';
import { validateBody } from '../middlewares/validate';
import { preferencesBody, sessionIdParam } from '../validators/api';
import { userRepository } from '../repositories/userRepository';
import { authService } from '../services/authService';
import { Preference } from '../models/Preference';
import { badRequest, notFound } from '../utils/errors';
import { hasPermission, permissionsFor } from '../security/rbac';

export const meRouter = Router();
meRouter.use(authenticate, rateLimit('authenticated'));

meRouter.get('/me', ah(async (req, res) => {
  const u = await userRepository.findById(req.auth!.userId);
  if (!u || u.disabledAt) throw notFound('User not found');
  res.json({ user: { id: String(u._id), email: u.email, name: u.name, role: u.role, emailVerified: u.emailVerified }, permissions: permissionsFor(u.role as never) });
}));

meRouter.get('/sessions', requirePermission('session:manage:own'), ah(async (req, res) => {
  const list = await authService.listSessions(req.auth!.userId);
  res.json({ sessions: list.map((s) => ({ sessionId: s.sessionId, device: s.device, browser: s.browser, ip: s.ip, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt, expiresAt: s.expiresAt, current: s.sessionId === req.auth!.sessionId })) });
}));
meRouter.delete('/sessions/:sessionId', requirePermission('session:manage:own'), ah(async (req, res) => {
  const id = sessionIdParam.safeParse(req.params['sessionId']);
  if (!id.success) throw badRequest('Invalid session id');
  await authService.revokeOwnSession(req.auth!.userId, id.data, req.ip);
  res.status(204).end();
}));

// ---- Long-term memory controls ----
meRouter.get('/preferences', requirePermission('preferences:manage:own'), ah(async (req, res) => {
  res.json({ preferences: (await Preference.findOne({ userId: req.auth!.userId }).select('-_id -__v -userId').lean()) ?? { memoryEnabled: true } });
}));
meRouter.put('/preferences', requirePermission('preferences:manage:own'), validateBody(preferencesBody), ah(async (req, res) => {
  const p = await Preference.findOneAndUpdate({ userId: req.auth!.userId }, { $set: req.body }, { upsert: true, new: true }).select('-_id -__v -userId').lean();
  res.json({ preferences: p });
}));
meRouter.delete('/preferences', requirePermission('preferences:manage:own'), ah(async (req, res) => {
  await Preference.deleteOne({ userId: req.auth!.userId }); // "forget me"
  res.status(204).end();
}));
void hasPermission;
