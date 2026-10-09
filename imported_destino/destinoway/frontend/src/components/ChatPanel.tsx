'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/store/session';

const STEP = { start: '…', done: '✓', error: '!' } as const;

export function ChatPanel({ onSend }: { onSend: (t: string) => void }) {
  const { messages, progress, busy } = useSession();
  const [text, setText] = useState(''); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, progress]);
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!text.trim() || busy) return; onSend(text); setText(''); };
  return (
    <section aria-label="Conversation" className="flex h-full min-h-0 flex-col rounded-2xl border border-ink/10 bg-white">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && <p className="text-slate2">Tell me about your trip — where from, where to, when, and any budget. I’ll ask only what I need.</p>}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
            <p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[15px] ${m.role === 'user' ? 'bg-teal text-white' : 'bg-mist'}`}>{m.content || (m.streaming ? '…' : '')}</p>
          </div>
        ))}
        {progress.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-dashed border-teal/40 p-3 text-sm" aria-label="Progress">
            {progress.map((p) => <li key={p.step} className={p.status === 'error' ? 'text-red-700' : p.status === 'done' ? 'text-teal' : 'text-slate2'}><span className="mr-1.5 inline-block w-4 font-semibold">{STEP[p.status]}</span>{p.label.replace(/^✓\s*/, '')}</li>)}
          </ul>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-ink/10 p-3">
        <label htmlFor="chat" className="sr-only">Message</label>
        <input id="chat" className="field" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message…" autoComplete="off" />
        <button className="btn" disabled={busy || !text.trim()}>Send</button>
      </form>
    </section>
  );
}
