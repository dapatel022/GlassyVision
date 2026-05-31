import * as Sentry from '@sentry/nextjs';

// Client-side Sentry init. Gated on the public DSN. No session replay / no PII
// — keeps the client bundle light and avoids capturing customer Rx data.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    enabled: process.env.NODE_ENV === 'production',
  });
}

// Instruments App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
