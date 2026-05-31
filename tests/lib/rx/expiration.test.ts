import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isRxExpired } from '@/lib/rx/expiration';

// Pin "now" to midday UTC on 2026-06-15 so every common timezone agrees the
// local calendar date is 2026-06-15. Expiration is a CALENDAR date (Postgres
// `date`), so the result must not depend on the server's timezone.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('isRxExpired', () => {
  it('is not expired on the expiration date itself (valid through that day)', () => {
    expect(isRxExpired('2026-06-15')).toBe(false);
  });

  it('is expired the day after the expiration date', () => {
    expect(isRxExpired('2026-06-14')).toBe(true);
  });

  it('is not expired before the expiration date', () => {
    expect(isRxExpired('2026-06-16')).toBe(false);
  });

  it('treats a far-past date as expired', () => {
    expect(isRxExpired('2020-01-01')).toBe(true);
  });

  it('treats a far-future date as not expired', () => {
    expect(isRxExpired('2099-01-01')).toBe(false);
  });

  it('treats a null/absent date as not expired (admin review is the gate)', () => {
    expect(isRxExpired(null)).toBe(false);
    expect(isRxExpired(undefined)).toBe(false);
  });

  it('treats an unparseable date as not expired', () => {
    expect(isRxExpired('not-a-date')).toBe(false);
  });

  it('handles single-digit month/day', () => {
    expect(isRxExpired('2026-6-14')).toBe(true);
    expect(isRxExpired('2026-6-16')).toBe(false);
  });

  it('handles an ISO datetime suffix defensively (past = expired)', () => {
    expect(isRxExpired('2020-01-01T00:00:00Z')).toBe(true);
  });

  it('handles an ISO datetime suffix defensively (future = not expired)', () => {
    expect(isRxExpired('2099-01-01T00:00:00Z')).toBe(false);
  });
});
