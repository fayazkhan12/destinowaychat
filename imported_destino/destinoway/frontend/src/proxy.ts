import { NextResponse, type NextRequest } from 'next/server';

/** Next 16 `proxy` (formerly middleware). Per-request nonce CSP. Auth gating is NOT done here: the API enforces authN/authZ; the UI only redirects for UX. */
export function proxy(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const ws = api.replace(/^http/, 'ws');
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'", // React `style={{}}` attributes (e.g. the budget bar); style *elements* stay nonce-only
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${api} ${ws}`,
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('content-security-policy', csp);
  return res;
}
export const config = { matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] }] };
