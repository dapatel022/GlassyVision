import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-base">
      <div className="text-center space-y-4">
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink">
          403
        </h1>
        <p className="font-serif italic text-muted">
          You don&apos;t have permission to access this page.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 px-6 py-2 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
