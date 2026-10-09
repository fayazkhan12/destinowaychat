'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const EXAMPLES = [
  'Plan a 5-day Goa trip under ₹40,000.',
  'Jaipur se Dubai ki sasti flight dikhao.',
  'Find me the cheapest flight to Dubai.',
  'Book a hotel near Jaipur airport.',
  'Plan a luxury honeymoon.',
];

export default function Home() {
  const [text, setText] = useState(''); const router = useRouter();
  const go = (t: string) => { const v = t.trim(); if (v) router.push(`/plan?prompt=${encodeURIComponent(v.slice(0, 500))}`); };
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 pb-16">
      <header className="flex items-center justify-between py-6">
        <span className="font-display text-2xl font-bold text-teal">Destinoway</span>
        <nav className="flex gap-2"><Link href="/login" className="btn-ghost">Sign in</Link><Link href="/register" className="btn">Get started</Link></nav>
      </header>
      <section className="my-auto py-12">
        <h1 className="font-display text-5xl font-bold leading-[1.05] sm:text-6xl">Tell me what you want to plan.</h1>
        <p className="mt-4 max-w-xl text-lg text-slate2">Write it the way you’d tell a friend who happens to be a travel expert — in English, Hindi, Hinglish or your own language.</p>
        <form onSubmit={(e) => { e.preventDefault(); go(text); }} className="mt-8">
          <label htmlFor="prompt" className="sr-only">What do you want to plan?</label>
          <textarea id="prompt" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(text); } }}
            placeholder="Jaipur to Dubai on 15 November for 2 people, around ₹1 lakh…"
            className="w-full resize-none rounded-2xl border-2 border-ink/15 bg-white p-4 text-lg outline-none focus:border-teal" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn px-6" disabled={!text.trim()}>Start planning</button>
            <span className="text-sm text-slate2">Enter to send · Shift+Enter for a new line</span>
          </div>
        </form>
        <ul className="mt-8 flex flex-wrap gap-2" aria-label="Examples">
          {EXAMPLES.map((e) => <li key={e}><button onClick={() => go(e)} className="rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-sm hover:border-teal">{e}</button></li>)}
        </ul>
      </section>
    </main>
  );
}
