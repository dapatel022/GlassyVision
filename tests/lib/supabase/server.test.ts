import { describe, it, expect, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ from: vi.fn(), auth: { getUser: vi.fn() } })),
}));

describe('Supabase server client', () => {
  it('createServerClient returns a client wired with cookie adapters', async () => {
    const { createServerClient } = await import('@/lib/supabase/server');
    const client = await createServerClient();
    expect(client).toBeDefined();
    expect(client.from).toBeDefined();
    expect(client.auth).toBeDefined();
  });
});
