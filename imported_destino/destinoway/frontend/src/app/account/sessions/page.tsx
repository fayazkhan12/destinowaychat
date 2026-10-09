'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/hooks/useAuth';
import { closeSocket } from '@/lib/socket';

interface Sess { sessionId: string; device?: string; browser?: string; ip?: string; lastActiveAt: string; current: boolean }

export default function SessionsPage() {
  const { user, loading } = useRequireAuth(); const qc = useQueryClient(); const router = useRouter();
  const q = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ sessions: Sess[] }>('/sessions'), enabled: Boolean(user) });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/sessions/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) });
  const all = useMutation({ mutationFn: () => api('/auth/logout-all', { method: 'POST' }), onSuccess: () => { closeSocket(); router.replace('/login'); } });
  if (loading) return null;
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/plan" className="text-sm text-teal underline">← Back to planning</Link>
      <h1 className="mt-3 text-3xl font-bold">Signed-in devices</h1>
      <ul className="mt-6 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
        {q.data?.sessions.map((s) => (
          <li key={s.sessionId} className="flex items-center justify-between gap-3 p-4">
            <div><p className="font-semibold">{s.browser} on {s.device}{s.current && <span className="ml-2 rounded-full bg-teal-soft px-2 py-0.5 text-xs text-teal">This device</span>}</p>
              <p className="text-sm text-slate2">{s.ip} · active {new Date(s.lastActiveAt).toLocaleString()}</p></div>
            {!s.current && <button className="btn-ghost" onClick={() => revoke.mutate(s.sessionId)}>Sign out</button>}
          </li>
        ))}
      </ul>
      <button className="btn mt-6" onClick={() => all.mutate()}>Sign out everywhere</button>
    </main>
  );
}
