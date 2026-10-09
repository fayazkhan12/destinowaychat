'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AuthShell, FormError } from '@/components/AuthCard';

export default function RegisterPage() {
  const [f, setF] = useState({ name: '', email: '', password: '' }); const [err, setErr] = useState<string>(); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(undefined);
    try { await api('/auth/register', { method: 'POST', body: f }); setDone(true); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not create the account'); } finally { setBusy(false); }
  }
  if (done) return <AuthShell title="Check your email" subtitle={`If ${f.email} can be registered, we’ve sent a verification link. It expires in 24 hours.`} footer={<Link className="font-semibold text-teal underline" href="/login">Back to sign in</Link>}>{null}</AuthShell>;
  return (
    <AuthShell title="Create your account" subtitle="One assistant for flights, stays and everything in between." footer={<>Already registered? <Link className="font-semibold text-teal underline" href="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="grid gap-3.5">
        <FormError msg={err} />
        <label className="grid gap-1 text-sm font-semibold">Name<input className="field" autoComplete="name" required maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Email<input className="field" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Password<input className="field" type="password" autoComplete="new-password" required minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><span className="text-xs font-normal text-slate2">At least 10 characters, with letters and numbers.</span></label>
        <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
    </AuthShell>
  );
}
