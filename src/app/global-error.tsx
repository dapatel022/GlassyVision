'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Catches errors thrown in the root layout/template itself (which the
// segment-level error.tsx cannot). Must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase' }}>Something broke.</h1>
          <p style={{ color: '#666' }}>We&apos;ve been notified. Please try again.</p>
          <button
            onClick={reset}
            style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', background: '#000', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer', textTransform: 'uppercase', fontWeight: 700 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
