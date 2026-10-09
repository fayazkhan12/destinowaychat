'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import type { User } from '@/types';

/** UX-only gate. The API independently enforces authentication, RBAC and ownership on every request. */
export function useRequireAuth() {
  const { user, setUser } = useSession();
  const [loading, setLoading] = useState(!user);
  const router = useRouter();
  useEffect(() => {
    if (user) return;
    api<{ user: User }>('/me').then((r) => setUser(r.user)).catch(() => router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)).finally(() => setLoading(false));
  }, [user, setUser, router]);
  return { user, loading };
}
