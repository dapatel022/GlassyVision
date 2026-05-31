export interface RetryOptions {
  /** Number of retries after the initial attempt. Default 3. */
  retries?: number;
  /** Base delay in ms for exponential backoff (used when no Retry-After). Default 500. */
  baseDelayMs?: number;
  /** Injectable sleep, for tests. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * fetch() with retry/backoff for Shopify's rate limits. Retries on 429 and 5xx
 * (transient), honoring the `Retry-After` header when present and otherwise
 * backing off exponentially. Non-429 4xx are returned immediately (not
 * transient). After the retry budget is exhausted the last response is returned
 * so the caller can surface the real status.
 */
export async function fetchWithRetry(
  input: string | URL | Request,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    const response = await fetch(input, init);

    const isTransient = response.status === 429 || response.status >= 500;
    if (!isTransient || attempt >= retries) {
      return response;
    }

    const retryAfter = response.headers.get('retry-after');
    const delay = retryAfter ? Number(retryAfter) * 1000 : baseDelayMs * 2 ** attempt;
    await sleep(delay);
    attempt++;
  }
}
