import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const fromAdmin = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => Promise.resolve({ auth: { getUser } })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: fromAdmin })),
}));
vi.mock('@/lib/auth/claim-token', () => ({
  verifyClaimToken: vi.fn((cid: string) => cid === 'cust-1'),
}));

// `update(...).eq(...).is('auth_user_id', null).select('id')` resolves to
// `updatedRows` — [] simulates losing the atomic claim race.
function installCustomer(row: Record<string, unknown> | null, updatedRows: Array<{ id: string }> = [{ id: 'cust-1' }]) {
  const update = vi.fn(() => ({
    eq: () => ({ is: () => ({ select: () => Promise.resolve({ data: updatedRows, error: null }) }) }),
  }));
  fromAdmin.mockImplementation((table: string) => {
    if (table === 'customers') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
        update,
      };
    }
    return {};
  });
  return update;
}

beforeEach(() => { getUser.mockReset(); fromAdmin.mockReset(); });

describe('claimAccount', () => {
  it('returns needsAuth when not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: null });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res).toEqual({ status: 'needsAuth' });
  });

  it('rejects an invalid token', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    installCustomer({ id: 'cust-2', email: 'a@b.com', auth_user_id: null });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-2', 'tok', Date.now() + 10000);
    expect(res.status).toBe('error');
  });

  it('binds auth_user_id on a valid, email-matched claim', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    const update = installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: null });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res.status).toBe('claimed');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ auth_user_id: 'u-1' }));
  });

  it('REJECTS a claim where the auth email differs from the checkout email (no bind)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'other@x.com' } }, error: null });
    const update = installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: null });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res.status).toBe('error');
    if (res.status === 'error') expect(res.error).toMatch(/email/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('is idempotent when already claimed by the same user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: 'u-1' });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res.status).toBe('claimed');
  });

  it('rejects when already claimed by a different user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-2', email: 'a@b.com' } }, error: null });
    installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: 'u-1' });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res.status).toBe('error');
  });

  it('rejects when the row was claimed concurrently (atomic update returns no rows)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: null }, []);
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res.status).toBe('error');
  });
});
