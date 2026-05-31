import * as Sentry from '@sentry/nextjs';

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[error]', error, context);
    }
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[sentry-stub:${level}]`, message);
    }
    return;
  }

  Sentry.captureMessage(message, level);
}
