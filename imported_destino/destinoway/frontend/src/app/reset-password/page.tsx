'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AuthShell, FormError } from '@/components/AuthCard';

function Form() {
  const token = useSearchParams().get('token') ?? ''; const router = useRouter();
  const [password, setPassword] = useState(''); const [err, setErr] = useState<string>();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(undefined);
    try { await api('/auth/reset-password', { method: 'POST', body: { token, password } }); router.replace('/login'); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not reset'); }
  }
  return (
    <AuthShell title="Choose a new password" subtitle="You’ll be signed out of every device.">
      <form onSubmit={submit} className="grid gap-3.5">
        <FormError msg={err} />
        <label className="grid gap-1 text-sm font-semibold">New password<input className="field" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn">Save password</button>
      </form>
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Form /></Suspense>; }
