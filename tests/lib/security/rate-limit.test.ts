import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter, clientIpFrom } from '@/lib/security/rate-limit';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createRateLimiter', () => {
  it('allows up to the limit within the window, then blocks', () => {
    const limit = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limit('1.2.3.4')).toBe(true);
    expect(limit('1.2.3.4')).toBe(true);
    expect(limit('1.2.3.4')).toBe(true);
    expect(limit('1.2.3.4')).toBe(false);
  });

  it('tracks keys independently', () => {
    const limit = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limit('a')).toBe(true);
    expect(limit('b')).toBe(true);
    expect(limit('a')).toBe(false);
  });

  it('resets after the window elapses', () => {
    const limit = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limit('a')).toBe(true);
    expect(limit('a')).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(limit('a')).toBe(true);
  });

  it('evicts stale entries so memory stays bounded', () => {
    const limit = createRateLimiter({ windowMs: 1_000, max: 1, maxKeys: 2 });
    limit('k1');
    limit('k2');
    limit('k3'); // exceeds maxKeys → oldest evicted, no throw, still functions
    expect(limit('k3')).toBe(false);
  });
});

describe('clientIpFrom', () => {
  it('takes the FIRST x-forwarded-for entry (client, not proxies)', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
    expect(clientIpFrom(h)).toBe('203.0.113.9');
  });

  it('falls back to a stable key when the header is absent', () => {
    expect(clientIpFrom(new Headers())).toBe('unknown');
  });
});
