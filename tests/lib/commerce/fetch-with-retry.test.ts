import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '@/lib/commerce/fetch-with-retry';

const noSleep = () => Promise.resolve();

function res(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 200 ? '{"ok":true}' : 'err', { status, headers });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchWithRetry', () => {
  it('returns immediately on a 2xx without retrying', async () => {
    fetchMock.mockResolvedValueOnce(res(200));
    const r = await fetchWithRetry('https://x', {}, { sleep: noSleep });
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(200));
    const r = await fetchWithRetry('https://x', {}, { sleep: noSleep });
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    const r = await fetchWithRetry('https://x', {}, { sleep: noSleep });
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget and returns the last response', async () => {
    fetchMock.mockResolvedValue(res(429));
    const r = await fetchWithRetry('https://x', {}, { retries: 2, sleep: noSleep });
    expect(r.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on a 4xx that is not 429', async () => {
    fetchMock.mockResolvedValueOnce(res(404));
    const r = await fetchWithRetry('https://x', {}, { sleep: noSleep });
    expect(r.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors the Retry-After header for the delay', async () => {
    fetchMock.mockResolvedValueOnce(res(429, { 'retry-after': '2' })).mockResolvedValueOnce(res(200));
    const sleep = vi.fn(() => Promise.resolve());
    await fetchWithRetry('https://x', {}, { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
  });
});
