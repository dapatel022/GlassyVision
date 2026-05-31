import * as Sentry from '@sentry/nextjs';

// Server-side Sentry init. Gated on DSN so it's a no-op until a Sentry project
// is configured. sendDefaultPii is deliberately false — this app handles Rx
// prescription PII and must not ship IPs/headers/request bodies to Sentry.
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    enabled: process.env.NODE_ENV === 'production',
  });
}
