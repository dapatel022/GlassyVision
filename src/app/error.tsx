'use client';

import { useEffect } from 'react';
import { captureException } from '@/lib/observability/sentry';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { boundary: 'global-error' });
  }, [error]);

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">500</p>
        <h1 className="font-sans text-5xl font-black tracking-tight uppercase text-ink mb-4">
          Something broke<span className="text-accent">.</span>
        </h1>
        <p className="text-muted font-serif italic mb-8">
          We&apos;ve been notified and will take a look. In the meantime, try refreshing.
        </p>
        <button
          onClick={reset}
          className="inline-block px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
