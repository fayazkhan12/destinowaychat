import { io, type Socket } from 'socket.io-client';
import { API_URL, refreshSession } from './api';

let socket: Socket | null = null;
/** Auth travels in the HttpOnly cookie - no token is ever read by JavaScript. */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, { withCredentials: true, transports: ['websocket', 'polling'], reconnectionDelayMax: 8000 });
  let retried = false;
  socket.on('connect', () => { retried = false; });
  socket.on('connect_error', async (err) => {
    if (!retried && /unauthenticated|session/.test(err.message)) { retried = true; if (await refreshSession()) socket?.connect(); }
  });
  socket.on('auth:expired', async () => { if (await refreshSession()) { socket?.disconnect(); socket?.connect(); } });
  return socket;
}
export function closeSocket() { socket?.disconnect(); socket = null; }

/** Resolves once the socket is connected (reconnecting if needed). */
export function ensureConnected(timeoutMs = 8000): Promise<boolean> {
  const s = getSocket();
  if (s.connected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t = setTimeout(() => { s.off('connect', ok); resolve(false); }, timeoutMs);
    const ok = () => { clearTimeout(t); resolve(true); };
    s.once('connect', ok);
    s.connect();
  });
}
