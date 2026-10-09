import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { allowedOrigins } from '../config/env';
import { verifyAccessToken } from '../auth/tokens';
import { sessionStore } from '../auth/sessionStore';
import { ACCESS_COOKIE } from '../middlewares/authenticate';
import { eventBus } from '../events/eventBus';
import { logger } from '../observability/logger';
import { chatBody } from '../validators/api';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redis } from '../config/redis';
import type { UniversalAIOrchestrator } from '../orchestrator/UniversalAIOrchestrator';
import { toClientState } from '../services/tripStateService';
import type { Role } from '../security/rbac';
import { hasPermission } from '../security/rbac';
import { AppError } from '../utils/errors';
import { randomUUID } from 'node:crypto';

interface SocketAuth { userId: string; sessionId: string; role: Role; emailVerified: boolean; exp: number }
const chatLimiter = new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl:ws-chat', points: 20, duration: 60 });

export function attachSocketGateway(http: HttpServer, orchestrator: UniversalAIOrchestrator) {
  const io = new Server(http, { cors: { origin: allowedOrigins, credentials: true }, maxHttpBufferSize: 16 * 1024, transports: ['websocket', 'polling'] });

  // Authenticate the HttpOnly cookie during the handshake (token never touches JS).
  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (!origin || !allowedOrigins.includes(origin)) return next(new Error('origin_not_allowed'));
      const token = parseCookie(socket.handshake.headers.cookie ?? '')[ACCESS_COOKIE];
      if (!token) return next(new Error('unauthenticated'));
      const c = verifyAccessToken(token);
      if (!(await sessionStore.isActive(c.sid))) return next(new Error('session_revoked'));
      socket.data.auth = { userId: c.sub, sessionId: c.sid, role: c.role as Role, emailVerified: Boolean(c.ev), exp: c.exp } satisfies SocketAuth;
      next();
    } catch { next(new Error('unauthenticated')); }
  });

  // Fan-out domain events (from any instance/worker) to the owning user's sockets only.
  eventBus.on('*', (e) => { if (e.userId) io.to(`user:${e.userId}`).emit('event', { type: e.type, tripId: e.tripId, payload: e.payload, at: e.at }); });

  io.on('connection', (socket: Socket) => {
    const auth = socket.data.auth as SocketAuth;
    void socket.join(`user:${auth.userId}`);

    socket.on('chat:send', async (raw: unknown, ack?: (r: unknown) => void) => {
      const requestId = randomUUID();
      try {
        // Re-validate on every event: token expiry and revocation apply to long-lived sockets too.
        if (auth.exp * 1000 < Date.now()) { socket.emit('auth:expired'); return ack?.({ ok: false, code: 'TOKEN_EXPIRED' }); }
        if (!(await sessionStore.isActive(auth.sessionId))) { socket.emit('auth:revoked'); return socket.disconnect(true); }
        if (!hasPermission(auth.role, 'chat:use')) return ack?.({ ok: false, code: 'FORBIDDEN' });
        const parsed = chatBody.safeParse(raw);
        if (!parsed.success) return ack?.({ ok: false, code: 'VALIDATION_ERROR' });
        try { await chatLimiter.consume(auth.userId); } catch { return ack?.({ ok: false, code: 'RATE_LIMITED' }); }

        const messageId = randomUUID();
        socket.emit('chat:start', { messageId });
        const result = await orchestrator.handle({ auth, text: parsed.data.text, tripId: parsed.data.tripId, requestId }, (ev) => {
          if (ev.type === 'progress') socket.emit('chat:progress', ev);
          else if (ev.type === 'token') socket.emit('chat:token', { messageId, text: ev.text });
          else if (ev.type === 'approval') socket.emit('chat:approval', ev);
        });
        socket.emit('trip:state', { tripId: result.tripId, state: toClientState(result.state) });
        socket.emit('chat:done', { messageId, tripId: result.tripId, text: result.text });
        ack?.({ ok: true, tripId: result.tripId });
      } catch (e) {
        const code = e instanceof AppError ? e.code : 'INTERNAL';
        if (!(e instanceof AppError)) logger.error({ err: (e as Error).message, requestId }, 'chat:send failed');
        socket.emit('chat:error', { code, message: e instanceof AppError ? e.message : "Something went wrong on my side. Please try again." });
        ack?.({ ok: false, code });
      }
    });
  });
  return io;
}
