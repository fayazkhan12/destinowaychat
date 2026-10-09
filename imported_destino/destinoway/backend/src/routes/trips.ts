import { Router } from 'express';
import { ah } from '../middlewares/asyncHandler';
import { authenticate, requirePermission } from '../middlewares/authenticate';
import { rateLimit } from '../middlewares/rateLimit';
import { validateBody } from '../middlewares/validate';
import { chatBody, idParam } from '../validators/api';
import { tripStateService, toClientState } from '../services/tripStateService';
import { badRequest } from '../utils/errors';
import type { UniversalAIOrchestrator } from '../orchestrator/UniversalAIOrchestrator';

export function buildTripsRouter(orchestrator: UniversalAIOrchestrator) {
  const r = Router();
  r.use(authenticate);

  r.get('/trips', requirePermission('trip:read:own'), rateLimit('authenticated'), ah(async (req, res) => {
    res.json({ trips: await tripStateService.listTrips(req.auth!.userId) });
  }));
  r.get('/trips/:id', requirePermission('trip:read:own'), rateLimit('authenticated'), ah(async (req, res) => {
    const id = idParam.safeParse(req.params['id']); if (!id.success) throw badRequest('Invalid trip id');
    const { state, conversationId } = await tripStateService.load(id.data, req.auth!.userId); // ownership enforced in query
    const messages = await tripStateService.recentMessages(conversationId, req.auth!.userId, 50);
    res.json({ tripId: id.data, state: toClientState(state), messages });
  }));

  /** REST fallback for clients without WebSocket (no live progress, same orchestrator, same guards). */
  r.post('/chat/messages', requirePermission('chat:use'), rateLimit('ai'), validateBody(chatBody), ah(async (req, res) => {
    const result = await orchestrator.handle({ auth: req.auth!, text: req.body.text, tripId: req.body.tripId, requestId: req.requestId }, () => undefined);
    res.json({ tripId: result.tripId, reply: result.text, state: toClientState(result.state) });
  }));
  return r;
}
