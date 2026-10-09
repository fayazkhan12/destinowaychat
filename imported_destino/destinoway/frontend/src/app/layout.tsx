import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Source_Sans_3 } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { Providers } from './providers';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Source_Sans_3({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = { title: 'Destinoway — tell me where, I’ll plan the trip', description: 'Your personal AI travel expert. Describe the trip in your own words and language.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0D5C63' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined; // reading headers() makes the page dynamic so the CSP nonce is applied to Next's inline scripts
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body data-nonce={nonce}><Providers>{children}</Providers></body>
    </html>
  );
}
