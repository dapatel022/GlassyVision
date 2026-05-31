import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const maybeSingle = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => Promise.resolve({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  })),
}));

beforeEach(() => { getUser.mockReset(); maybeSingle.mockReset(); });

describe('getCurrentCustomer', () => {
  it('returns null when not authenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { getCurrentCustomer } = await import('@/lib/auth/customer');
    expect(await getCurrentCustomer()).toBeNull();
  });

  it('returns null when the auth user has no linked customer row', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { getCurrentCustomer } = await import('@/lib/auth/customer');
    expect(await getCurrentCustomer()).toBeNull();
  });

  it('returns the customer when linked', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    maybeSingle.mockResolvedValue({ data: { id: 'cust-1', email: 'a@b.com', first_name: 'A' }, error: null });
    const { getCurrentCustomer } = await import('@/lib/auth/customer');
    const result = await getCurrentCustomer();
    expect(result).toEqual({ id: 'cust-1', email: 'a@b.com', authUserId: 'u-1' });
  });
});
