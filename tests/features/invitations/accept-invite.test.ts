import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const createUser = vi.fn(() => Promise.resolve({ data: { user: { id: 'u-1' } }, error: null }));
const deleteUser = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom, auth: { admin: { createUser, deleteUser } } })),
}));

const future = new Date(Date.now() + 86_400_000).toISOString();

function install(upsert: ReturnType<typeof vi.fn>) {
  const invitation = { id: 'inv-1', email: 'lab@x.com', role: 'lab_qc', expires_at: future, accepted_at: null };
  // Simulate the handle_new_user trigger: the profile row already exists, so a
  // plain INSERT hits a primary-key collision. Only a conflict-safe write
  // (upsert) succeeds.
  const insert = vi.fn(() => Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_pkey"' } }));
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_invitations') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: invitation, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    if (table === 'profiles') return { upsert, insert };
    return {};
  });
}

beforeEach(() => {
  mockFrom.mockReset();
  createUser.mockClear();
});

describe('acceptInvite', () => {
  it('provisions the profile with the invited role (resilient to the auto-create trigger)', async () => {
    // The handle_new_user trigger already creates a 'pending' profile row when
    // the auth user is created, so accept must UPSERT (not plain insert) to
    // promote it to the invited role without a PK collision.
    const writer = vi.fn(() => Promise.resolve({ error: null }));
    install(writer);

    const { acceptInvite } = await import('@/features/invitations/actions/accept-invite');
    const result = await acceptInvite({ token: 'tok', password: 'longenough', fullName: 'Lab Person' });

    expect(result.success).toBe(true);
    expect(writer).toHaveBeenCalledTimes(1);
    const payload = (writer.mock.calls[0] as unknown[])[0] as { role: string };
    expect(payload.role).toBe('lab_qc');
  });
});
