'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { ChatPanel } from '@/components/ChatPanel';
import { TripWorkspace } from '@/components/TripWorkspace';
import { api } from '@/lib/api';
import { closeSocket } from '@/lib/socket';
import { useSession } from '@/store/session';

function Plan() {
  const { user, loading } = useRequireAuth();
  const { send, loadLatest } = useChat(); const sp = useSearchParams(); const router = useRouter();
  const [view, setView] = useState<'chat' | 'trip'>('chat'); const sent = useRef(false);
  const trip = useSession((s) => s.trip);

  const restored = useRef(false);
  useEffect(() => { // resume the latest trip after a refresh (unless the user arrived with a fresh prompt)
    if (user && !sp.get('prompt') && !restored.current && !useSession.getState().tripId) { restored.current = true; loadLatest().catch(() => undefined); }
  }, [user, sp, loadLatest]);

  useEffect(() => { // auto-send the prompt typed on the home page, once
    const p = sp.get('prompt');
    if (user && p && !sent.current) { sent.current = true; send(p); router.replace('/plan'); }
  }, [user, sp, send, router]);

  async function logout() { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); closeSocket(); useSession.setState({ user: null, messages: [], trip: undefined, tripId: undefined }); router.replace('/login'); }
  if (loading || !user) return <main className="grid min-h-screen place-items-center text-slate2">Loading…</main>;

  return (
    <div className="mx-auto flex h-screen max-w-7xl flex-col px-3 pb-3 sm:px-5">
      <header className="flex items-center justify-between py-3">
        <Link href="/" className="font-display text-xl font-bold text-teal">Destinoway</Link>
        <div className="flex items-center gap-2 text-sm"><span className="hidden text-slate2 sm:inline">{user.name}{!user.emailVerified && ' · email not verified'}</span>
          <Link href="/account/sessions" className="btn-ghost !py-1.5">Devices</Link><button onClick={logout} className="btn-ghost !py-1.5">Sign out</button></div>
      </header>
      <div className="mb-2 flex gap-2 lg:hidden">
        <button className={view === 'chat' ? 'btn flex-1' : 'btn-ghost flex-1'} onClick={() => setView('chat')}>Conversation</button>
        <button className={view === 'trip' ? 'btn flex-1' : 'btn-ghost flex-1'} onClick={() => setView('trip')}>Trip{trip?.flights.shortlist.length ? ` (${trip.flights.shortlist.length})` : ''}</button>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className={`min-h-0 ${view === 'chat' ? '' : 'hidden'} lg:block`}><ChatPanel onSend={send} /></div>
        <div className={`min-h-0 ${view === 'trip' ? '' : 'hidden'} lg:block`}><TripWorkspace onSelect={(n) => send(`select option ${n}`)} /></div>
      </div>
    </div>
  );
}
export default function PlanPage() { return <Suspense><Plan /></Suspense>; }
