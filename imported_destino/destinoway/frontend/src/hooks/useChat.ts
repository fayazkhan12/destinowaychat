'use client';
import { useCallback, useEffect } from 'react';
import { ensureConnected, getSocket } from '@/lib/socket';
import { api, refreshSession } from '@/lib/api';
import { useSession } from '@/store/session';
import type { ChatMessage, ProgressStep, TripState } from '@/types';

type Ack = { ok: boolean; code?: string };

/** Sends one chat message. If the access token expired while the tab was open, refreshes the cookie, reconnects, and resends the SAME message once. */
function emitWithRetry(text: string, fail: (m: string) => void, canRetry: boolean): void {
  getSocket().timeout(120_000).emit('chat:send', { text, tripId: useSession.getState().tripId }, async (err: Error | null, ack?: Ack) => {
    if (err) return fail('That took too long. Please try again.');
    if (ack?.ok) return;
    if (ack?.code === 'TOKEN_EXPIRED' && canRetry) {
      if (await refreshSession()) { getSocket().disconnect(); if (await ensureConnected()) return emitWithRetry(text, fail, false); }
      return fail('Your session expired. Please sign in again.');
    }
    if (ack?.code === 'RATE_LIMITED') return fail('You’re sending messages very quickly — please wait a moment.');
    // Other failures already reached the user through the `chat:error` event.
  });
}

export function useChat() {
  const s = useSession();

  useEffect(() => {
    const sock = getSocket();
    const st = useSession.getState;
    sock.on('chat:start', ({ messageId }: { messageId: string }) => { st().pushMessage({ id: messageId, role: 'assistant', content: '', streaming: true }); });
    sock.on('chat:progress', (p: ProgressStep) => {
      const cur = st().progress.filter((x) => x.step !== p.step); st().setProgress([...cur, p]);
    });
    sock.on('chat:token', ({ messageId, text }: { messageId: string; text: string }) => st().appendToken(messageId, text));
    sock.on('trip:state', ({ tripId, state }: { tripId: string; state: TripState }) => { st().setTripId(tripId); st().setTrip(state); });
    sock.on('chat:done', ({ messageId, text }: { messageId: string; text: string }) => { st().finishMessage(messageId, text); st().setBusy(false); setTimeout(() => st().setProgress([]), 1500); });
    sock.on('chat:error', ({ message }: { message: string }) => {
      st().pushMessage({ id: crypto.randomUUID(), role: 'assistant', content: message }); st().setBusy(false); st().setProgress([]);
    });
    return () => { ['chat:start', 'chat:progress', 'chat:token', 'trip:state', 'chat:done', 'chat:error'].forEach((e) => sock.off(e)); };
  }, []);

  const loadTrip = useCallback(async (tripId: string) => {
    const r = await api<{ state: TripState; messages: Array<{ role: 'user' | 'assistant'; content: string }> }>(`/trips/${tripId}`);
    s.setTripId(tripId); s.setTrip(r.state);
    s.setMessages(r.messages.map((m): ChatMessage => ({ id: crypto.randomUUID(), role: m.role, content: m.content })));
  }, [s]);

  const fail = useCallback((msg: string) => {
    const st = useSession.getState();
    st.pushMessage({ id: crypto.randomUUID(), role: 'assistant', content: msg }); st.setBusy(false); st.setProgress([]);
  }, []);

  const send = useCallback((text: string) => {
    const t = text.trim(); if (!t || useSession.getState().busy) return;
    useSession.getState().pushMessage({ id: crypto.randomUUID(), role: 'user', content: t });
    useSession.getState().setBusy(true); useSession.getState().setProgress([]);
    void ensureConnected().then((ok) => (ok ? emitWithRetry(t, fail, true) : fail('I can’t reach the server right now. Please check your connection.')));
  }, [fail]);

  /** On page reload, continue the most recent trip instead of starting from a blank screen. */
  const loadLatest = useCallback(async () => {
    const { trips } = await api<{ trips: Array<{ _id: string }> }>('/trips');
    if (trips[0]) await loadTrip(trips[0]._id);
  }, [loadTrip]);

  return { send, loadTrip, loadLatest };
}
