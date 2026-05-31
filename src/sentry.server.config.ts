import * as Sentry from '@sentry/nextjs';

// Server-side Sentry init. Gated on DSN so it's a no-op until a Sentry project
// is configured. sendDefaultPii is deliberately false — this app handles Rx
// prescription PII and must not ship IPs/headers/request bodies to Sentry.
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

// Gate the entire init on production: `enabled: false` would still instrument
// the runtime in dev, so we skip init outright instead.
if (dsn && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}
