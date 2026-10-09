'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { AuthShell } from '@/components/AuthCard';

function Verify() {
  const token = useSearchParams().get('token'); const [state, setState] = useState<'working' | 'ok' | 'bad'>(token ? 'working' : 'bad');
  useEffect(() => { if (token) api('/auth/verify-email', { method: 'POST', body: { token } }).then(() => setState('ok')).catch(() => setState('bad')); }, [token]);
  return (
    <AuthShell title={state === 'ok' ? 'Email verified' : state === 'bad' ? 'This link has expired' : 'Verifying…'} subtitle={state === 'bad' ? 'Sign in and request a new verification email.' : undefined}>
      <Link className="btn" href={state === 'ok' ? '/plan' : '/login'}>{state === 'ok' ? 'Start planning' : 'Go to sign in'}</Link>
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Verify /></Suspense>; }
