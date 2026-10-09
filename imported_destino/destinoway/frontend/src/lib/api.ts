export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
/** Single-flight refresh: parallel 401s trigger ONE refresh (avoids tripping refresh-token reuse detection). */
export function refreshSession(): Promise<boolean> {
  const attempt = async (retries: number): Promise<boolean> => {
    try {
      const r = await fetch(`${API_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'x-requested-with': 'destinoway' } });
      if (r.status === 409 && retries > 0) { await new Promise((res) => setTimeout(res, 400)); return attempt(retries - 1); } // another tab rotated the token a moment ago
      return r.ok;
    } catch { return false; }
  };
  refreshing ??= attempt(2).finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}, canRetry = true): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: opts.method ?? 'GET', credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'destinoway' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 401 && canRetry && !path.startsWith('/auth/') && (await refreshSession())) return api<T>(path, opts, false);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Something went wrong');
  return data as T;
}
