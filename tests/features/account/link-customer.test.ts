import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}));

function installRpc(result: number) {
  rpc.mockResolvedValue({ data: result, error: null });
}

beforeEach(() => { rpc.mockReset(); });

describe('linkCustomerByVerifiedEmail', () => {
  it('delegates to claim_customers_by_verified_email RPC and returns its count', async () => {
    installRpc(1);
    const { linkCustomerByVerifiedEmail } = await import('@/features/account/actions/link-customer');
    const res = await linkCustomerByVerifiedEmail('u-1', 'a@b.com');
    expect(res.linked).toBe(1);
    expect(rpc).toHaveBeenCalledWith('claim_customers_by_verified_email', {
      p_auth_user_id: 'u-1',
      p_email: 'a@b.com',
    });
  });

  it('returns linked: 0 when RPC returns 0 (no unclaimed rows)', async () => {
    installRpc(0);
    const { linkCustomerByVerifiedEmail } = await import('@/features/account/actions/link-customer');
    const res = await linkCustomerByVerifiedEmail('u-1', 'nobody@b.com');
    expect(res.linked).toBe(0);
  });

  it('handles multi-row consolidation (previously-crashing case): returns count from RPC', async () => {
    // Two unclaimed guest rows shared the same email — the RPC consolidates and
    // returns 2. The old inline-update approach would have hit a unique-index
    // violation on auth_user_id on the second row; the RPC merges before claiming.
    installRpc(2);
    const { linkCustomerByVerifiedEmail } = await import('@/features/account/actions/link-customer');
    const res = await linkCustomerByVerifiedEmail('u-1', 'dup@b.com');
    expect(res.linked).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('returns linked: 0 when RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'db error' } });
    const { linkCustomerByVerifiedEmail } = await import('@/features/account/actions/link-customer');
    const res = await linkCustomerByVerifiedEmail('u-1', 'a@b.com');
    expect(res.linked).toBe(0);
  });

  it('is a no-op without an authUserId or email (does not touch the DB)', async () => {
    const { linkCustomerByVerifiedEmail } = await import('@/features/account/actions/link-customer');
    expect((await linkCustomerByVerifiedEmail('', 'a@b.com')).linked).toBe(0);
    expect((await linkCustomerByVerifiedEmail('u-1', '')).linked).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
