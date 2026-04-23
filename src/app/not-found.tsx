import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">404</p>
        <h1 className="font-sans text-5xl font-black tracking-tight uppercase text-ink mb-4">
          Not here<span className="text-accent">.</span>
        </h1>
        <p className="text-muted font-serif italic mb-8">
          The page you were looking for moved, expired, or never existed.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
