'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, API_URL, ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { AuthShell, FormError } from '@/components/AuthCard';
import type { User } from '@/types';

function Form() {
  const router = useRouter(); const sp = useSearchParams(); const setUser = useSession((s) => s.setUser);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  const next = sp.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/plan'; // open-redirect protection
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(undefined);
    try { const r = await api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } }); setUser(r.user); router.replace(safeNext); }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not sign in'); } finally { setBusy(false); }
  }
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to pick up your trips." footer={<>New here? <Link className="font-semibold text-teal underline" href="/register">Create an account</Link></>}>
      <form onSubmit={submit} className="grid gap-3.5">
        <FormError msg={err} />
        <label className="grid gap-1 text-sm font-semibold">Email<input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Password<input className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <a className="btn-ghost" href={`${API_URL}/api/v1/auth/google/start`}>Continue with Google</a>
        <Link href="/forgot-password" className="text-sm text-teal underline">Forgot your password?</Link>
      </form>
    </AuthShell>
  );
}
export default function LoginPage() { return <Suspense><Form /></Suspense>; }
