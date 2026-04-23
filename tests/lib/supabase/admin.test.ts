import { describe, it, expect, vi } from 'vitest';

const mockCreateClient = vi.fn((..._args: unknown[]) => ({
  from: vi.fn(),
  auth: { getUser: vi.fn() },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

describe('Supabase admin client', () => {
  it('createAdminClient returns a client using service role key', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const client = createAdminClient();
    expect(client).toBeDefined();
    expect(client.from).toBeDefined();
    expect(mockCreateClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      }),
    );
  });

  it('createAdminClient returns the same singleton on subsequent calls', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const client1 = createAdminClient();
    const client2 = createAdminClient();
    expect(client1).toBe(client2);
  });
});
