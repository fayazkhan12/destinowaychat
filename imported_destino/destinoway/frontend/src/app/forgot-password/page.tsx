'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { AuthShell } from '@/components/AuthCard';

export default function Page() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) { e.preventDefault(); await api('/auth/forgot-password', { method: 'POST', body: { email } }).catch(() => undefined); setSent(true); }
  if (sent) return <AuthShell title="Check your email" subtitle="If an account exists for that address, a reset link is on its way. It expires in 30 minutes.">{null}</AuthShell>;
  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a link.">
      <form onSubmit={submit} className="grid gap-3.5">
        <label className="grid gap-1 text-sm font-semibold">Email<input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className="btn">Send reset link</button>
      </form>
    </AuthShell>
  );
}
