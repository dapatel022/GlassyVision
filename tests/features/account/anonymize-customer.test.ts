import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromAdmin = vi.fn();
const deleteUser = vi.fn(() => Promise.resolve({ error: null }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: fromAdmin, auth: { admin: { deleteUser } } })),
}));

beforeEach(() => { fromAdmin.mockReset(); deleteUser.mockClear(); });

describe('anonymizeCustomer', () => {
  it('scrubs PII, unlinks auth, sets deletion_requested_at, and never touches rx_files', async () => {
    const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: () => Promise.resolve({ error: null }) }));
    fromAdmin.mockImplementation((table: string) => {
      if (table === 'customers') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'cust-1', auth_user_id: 'u-1' }, error: null }) }) }),
          update,
        };
      }
      throw new Error(`anonymize must not touch table: ${table}`);
    });

    const { anonymizeCustomer } = await import('@/features/account/actions/anonymize-customer');
    const res = await anonymizeCustomer('cust-1');

    expect(res.success).toBe(true);
    const payload = update.mock.calls[0][0];
    expect(payload.email).toMatch(/deleted\.invalid$/);
    expect(payload.first_name).toBe('');
    expect(payload.last_name).toBe('');
    expect(payload.internal_notes).toBeNull();
    expect(payload.auth_user_id).toBeNull();
    expect(payload.deletion_requested_at).toEqual(expect.any(String));
    expect(deleteUser).toHaveBeenCalledWith('u-1');
  });

  it('succeeds (no-op auth delete) when the customer has no linked auth user', async () => {
    const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    fromAdmin.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'cust-1', auth_user_id: null }, error: null }) }) }),
      update,
    }));
    const { anonymizeCustomer } = await import('@/features/account/actions/anonymize-customer');
    const res = await anonymizeCustomer('cust-1');
    expect(res.success).toBe(true);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
