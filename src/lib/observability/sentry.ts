// Thin wrapper that stays a safe no-op until @sentry/nextjs is installed.
// When the user is ready to wire Sentry, run:
//   npm install @sentry/nextjs
//   npx @sentry/wizard@latest -i nextjs
// Then replace this module with the standard sentry.*.config.ts files, and
// the capture call sites below still work.

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[error]', error, context);
    }
    return;
  }
  // TODO: when @sentry/nextjs is installed, import and call Sentry.captureException here.
  if (process.env.NODE_ENV !== 'production') {
    console.error('[sentry-stub]', error, context);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  // TODO: when @sentry/nextjs is installed, import and call Sentry.captureMessage.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[sentry-stub:${level}]`, message);
  }
}
