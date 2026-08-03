/**
 * In-memory fixed-window rate limiter for public endpoints.
 *
 * Valid BECAUSE Cloud Run runs this app with max-instances=1: one process sees
 * all traffic, so process-local state is a real global limit. If max-instances
 * is ever raised, each instance gets its own budget (limit effectively
 * multiplies) — acceptable degradation, but revisit with a shared store
 * (e.g. Postgres/Redis) before scaling out.
 */

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** Bound on tracked keys so a spoofed-IP flood can't grow memory unbounded. */
  maxKeys?: number;
}

export function createRateLimiter({ windowMs, max, maxKeys = 10_000 }: RateLimiterOptions): (key: string) => boolean {
  const hits = new Map<string, { count: number; windowStart: number }>();

  return function allow(key: string): boolean {
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      if (hits.size >= maxKeys) {
        // Evict the oldest-inserted entry (Map preserves insertion order).
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      hits.set(key, { count: 1, windowStart: now });
      return true;
    }

    entry.count += 1;
    return entry.count <= max;
  };
}

/** Client IP on Cloud Run: first x-forwarded-for entry (appended by the LB). */
export function clientIpFrom(headers: Headers | undefined): string {
  if (!headers || typeof headers.get !== 'function') return 'unknown';
  const xff = headers.get('x-forwarded-for');
  if (!xff) return 'unknown';
  return xff.split(',')[0].trim() || 'unknown';
}
