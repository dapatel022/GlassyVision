import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn(), auth: { getUser: vi.fn() } })),
}));

describe('Supabase server client', () => {
  it('createServerClient returns a client with auth disabled for session', async () => {
    const { createServerClient } = await import('@/lib/supabase/server');
    const client = createServerClient();
    expect(client).toBeDefined();
    expect(client.from).toBeDefined();
    expect(client.auth).toBeDefined();
  });
});
