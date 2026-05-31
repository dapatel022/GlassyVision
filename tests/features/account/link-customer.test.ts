import { describe, it, expect, vi, beforeEach } from 'vitest';

const update = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ update }) }),
}));

function installUpdate(rows: Array<{ id: string }>) {
  update.mockReturnValue({
    eq: () => ({ is: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }) }),
  });
}

beforeEach(() => { update.mockReset(); });

describe('linkCustomerByVerifiedEmail', () => {
  it('binds unclaimed customer rows matching the verified email', async () => {
    installUpdate([{ id: 'cust-1' }]);
    const { linkCustomerByVerifiedEmail } = await import('@/features/account/actions/link-customer');
    const res = await linkCustomerByVerifiedEmail('u-1', 'a@b.com');
    expect(res.linked).toBe(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ auth_user_id: 'u-1' }));
  });

  it('links nothing when no unclaimed row matches', async () => {
    installUpdate([]);
    const { linkCustomerByVerifiedEmail } = await import('@/features/account/actions/link-customer');
    const res = await linkCustomerByVerifiedEmail('u-1', 'nobody@b.com');
    expect(res.linked).toBe(0);
  });

  it('is a no-op without an authUserId or email (does not touch the DB)', async () => {
    const { linkCustomerByVerifiedEmail } = await import('@/features/account/actions/link-customer');
    expect((await linkCustomerByVerifiedEmail('', 'a@b.com')).linked).toBe(0);
    expect((await linkCustomerByVerifiedEmail('u-1', '')).linked).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});
