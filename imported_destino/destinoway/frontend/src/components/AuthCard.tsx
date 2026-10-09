import Link from 'next/link';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center px-5 py-10">
      <Link href="/" className="mb-8 font-display text-2xl font-bold text-teal">Destinoway</Link>
      <h1 className="text-3xl font-bold">{title}</h1>
      {subtitle && <p className="mt-2 text-slate2">{subtitle}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 text-sm text-slate2">{footer}</div>}
    </main>
  );
}
export function FormError({ msg }: { msg?: string }) {
  return msg ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</p> : null;
}
