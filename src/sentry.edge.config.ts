import * as Sentry from '@sentry/nextjs';

// Edge-runtime Sentry init (middleware, edge routes). See sentry.server.config
// for the PII rationale.
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}
