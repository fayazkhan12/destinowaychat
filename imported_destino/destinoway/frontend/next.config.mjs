import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(here, '..'), // monorepo: trace deps from the repo root so `standalone` runs in Docker
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  compress: true,
  images: { formats: ['image/avif', 'image/webp'] },
  async headers() {
    // CSP (with per-request nonce) is set in src/middleware.ts. These are the static ones.
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    ] }];
  },
};
export default nextConfig;
