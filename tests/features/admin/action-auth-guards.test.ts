import { describe, it, expect, vi, beforeEach } from 'vitest';

// Verifies the auth sweep: every privileged 'use server' action must reject
// unauthenticated and under-privileged callers BEFORE touching the database.
// These actions are independently-addressable POST endpoints, so the page-level
// layout gate is not enough — each must guard itself.

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve(null)),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
  isLabRole: (role: string) =>
    ['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'].includes(role),
}));

const NON_ADMIN = { id: 'lab-1', email: 'l@x.com', role: 'lab_operator', fullName: 'L' };
const REVIEWER = { id: 'r-1', email: 'r@x.com', role: 'reviewer', fullName: 'R' };

async function setUser(user: unknown) {
  const { getCurrentUser } = await import('@/lib/auth/middleware');
  vi.mocked(getCurrentUser).mockResolvedValueOnce(user as never);
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe('createInvitation — founder-only', () => {
  it('rejects unauthenticated callers without touching the DB', async () => {
    await setUser(null);
    const { createInvitation } = await import('@/features/admin/team/actions/invite-user');
    const result = await createInvitation('x@y.com', 'lab_operator');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a non-founder admin (reviewer) — team management is founder-only', async () => {
    await setUser(REVIEWER);
    const { createInvitation } = await import('@/features/admin/team/actions/invite-user');
    const result = await createInvitation('x@y.com', 'founder');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('reviewReturn — admin-only', () => {
  it('rejects unauthenticated callers (cannot issue Shopify refunds)', async () => {
    await setUser(null);
    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'r-1', decision: 'approved_refund', adminNotes: null });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a lab role', async () => {
    await setUser(NON_ADMIN);
    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'r-1', decision: 'approved_refund', adminNotes: null });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('adjustInventory / pushInventoryToShopify — admin-only', () => {
  it('adjustInventory rejects unauthenticated callers', async () => {
    await setUser(null);
    const { adjustInventory } = await import('@/features/admin/inventory/actions/adjust-inventory');
    const result = await adjustInventory('pool-1', 5, 'manual_correction', null);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('pushInventoryToShopify rejects a lab role', async () => {
    await setUser(NON_ADMIN);
    const { pushInventoryToShopify } = await import('@/features/admin/inventory/actions/adjust-inventory');
    const result = await pushInventoryToShopify('pool-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('createDrop / updateDrop — admin-only', () => {
  const dropInput = {
    slug: 's', name: 'n', number: 1, heroHeadline: null, heroCopy: null,
    startsAt: '2026-01-01', endsAt: '2026-02-01', state: 'draft' as const, totalCapacity: null,
  };

  it('createDrop rejects unauthenticated callers', async () => {
    await setUser(null);
    const { createDrop } = await import('@/features/admin/drops/actions/save-drop');
    const result = await createDrop(dropInput);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('updateDrop rejects a lab role', async () => {
    await setUser(NON_ADMIN);
    const { updateDrop } = await import('@/features/admin/drops/actions/save-drop');
    const result = await updateDrop('drop-1', dropInput);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('generateWorkOrder — admin-only', () => {
  it('rejects unauthenticated callers without touching the DB', async () => {
    await setUser(null);
    const { generateWorkOrder } = await import('@/features/admin/actions/generate-work-order');
    const result = await generateWorkOrder('rx-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
