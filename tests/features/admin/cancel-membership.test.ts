import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn(() => Promise.resolve({ data: 'pool-1', error: null }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() =>
    Promise.resolve({ id: 'f-1', email: 'f@x.com', role: 'founder', fullName: 'F' }),
  ),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

const calculateRefund = vi.fn();
const createRefund = vi.fn();
const getCapturedAmount = vi.fn();
vi.mock('@/lib/commerce/shopify-admin', () => ({
  calculateRefund: (...a: unknown[]) => calculateRefund(...a),
  createRefund: (...a: unknown[]) => createRefund(...a),
  getCapturedAmount: (...a: unknown[]) => getCapturedAmount(...a),
}));

interface MemberOpts {
  membership?: Record<string, unknown> | null;
  redemptions?: Array<{ status: string }>;
  /** Reserved pending_payment slots returned to releaseReservedSlots. */
  reserved?: Array<{ id: string; frame_variant_id: number | null }>;
}

/** Wire the supabase mock; capture all updates/inserts. */
function install(o: MemberOpts = {}) {
  const membership =
    'membership' in o
      ? o.membership
      : {
          id: 'mem-1',
          status: 'active',
          shopify_order_id: 555,
          currency: 'USD',
          pairs_total: 3,
        };
  const redemptions = o.redemptions ?? [{ status: 'available' }, { status: 'available' }];
  const reserved = o.reserved ?? [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

  mockFrom.mockImplementation((table: string) => {
    if (table === 'subscription_memberships') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: membership, error: null }) }),
        }),
        update: (values: Record<string, unknown>) => {
          updates.push({ table, values });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    }
    if (table === 'subscription_redemptions') {
      return {
        select: () => ({
          // status-count read: .select().eq() is thenable; AND
          // releaseReservedSlots: .select().eq().eq().not() chain.
          eq: () => {
            const p = Promise.resolve({ data: redemptions, error: null }) as Promise<unknown> & {
              eq?: unknown;
            };
            p.eq = () => ({ not: () => Promise.resolve({ data: reserved, error: null }) });
            return p;
          },
        }),
        update: (values: Record<string, unknown>) => {
          updates.push({ table, values });
          return { eq: () => ({ in: () => Promise.resolve({ error: null }) }) };
        },
      };
    }
    if (table === 'inventory_pool') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'pool-1', pool_quantity: 3 }, error: null }) }),
        }),
        update: (values: Record<string, unknown>) => {
          updates.push({ table, values });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    }
    if (table === 'inventory_adjustments') {
      return {
        insert: (values: Record<string, unknown>) => {
          inserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === 'audit_log') {
      return {
        insert: (values: Record<string, unknown>) => {
          inserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
      };
    }
    return {};
  });

  return { updates, inserts };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
  calculateRefund.mockResolvedValue({
    refund: { shipping: { amount: '0.00' }, transactions: [{ kind: 'suggested_refund', amount: '150.00' }] },
  });
  // Pro-rata BASE is the ORIGINAL captured amount, not the remaining refundable.
  getCapturedAmount.mockResolvedValue(150);
  createRefund.mockResolvedValue({ refund: { id: 1 } });
});

describe('cancelMembership', () => {
  it('rejects non-admin callers without touching the DB', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'op-1',
      email: 'op@x.com',
      role: 'lab_operator',
      fullName: 'O',
    });
    install();
    const { cancelMembership } = await import('@/features/admin/memberships/actions/cancel-membership');
    const res = await cancelMembership({ membershipId: 'mem-1', reason: 'test' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('computes pro-rata, refunds, expires slots, sets cancelled + audit', async () => {
    const { updates, inserts } = install();
    const { cancelMembership } = await import('@/features/admin/memberships/actions/cancel-membership');
    const res = await cancelMembership({ membershipId: 'mem-1', reason: 'customer request' });

    expect(res.success).toBe(true);
    // 2/3 * 150 = 100
    expect(createRefund).toHaveBeenCalledWith(555, 100, 'USD', expect.any(String));
    expect(
      updates.some(
        (u) => u.table === 'subscription_redemptions' && u.values.status === 'expired',
      ),
    ).toBe(true);
    expect(
      updates.some(
        (u) =>
          u.table === 'subscription_memberships' &&
          u.values.status === 'cancelled' &&
          u.values.cancelled_at != null &&
          u.values.cancel_reason === 'customer request',
      ),
    ).toBe(true);
    expect(inserts.some((i) => i.table === 'audit_log')).toBe(true);
  });

  it('pro-rates on the ORIGINAL captured base after a prior partial refund (not the remaining refundable)', async () => {
    // Order captured 150, a prior partial refund leaves 120 remaining-refundable.
    // 2-of-3 unredeemed must pro-rate on 150 → 100.00, NOT on 120 → 80.00.
    getCapturedAmount.mockResolvedValueOnce(150);
    calculateRefund.mockResolvedValueOnce({
      refund: { shipping: { amount: '0.00' }, transactions: [{ kind: 'suggested_refund', amount: '120.00' }] },
    });
    install({ redemptions: [{ status: 'available' }, { status: 'available' }] });
    const { cancelMembership } = await import('@/features/admin/memberships/actions/cancel-membership');
    const res = await cancelMembership({ membershipId: 'mem-1', reason: 'partial-refund history' });

    expect(res.success).toBe(true);
    expect(res.refundAmount).toBe(100);
    // Base came from getCapturedAmount (150), not the remaining 120.
    expect(getCapturedAmount).toHaveBeenCalledWith(555, 'USD');
    // createRefund still called (its own remaining-refundable cap is exercised separately).
    expect(createRefund).toHaveBeenCalledWith(555, 100, 'USD', expect.any(String));
  });

  it('releases inventory reserved by a pending_payment slot before expiring it', async () => {
    const { inserts, updates } = install({
      redemptions: [{ status: 'pending_payment' }, { status: 'available' }],
      reserved: [{ id: 'slot-1', frame_variant_id: 222 }],
    });
    const { cancelMembership } = await import('@/features/admin/memberships/actions/cancel-membership');
    const res = await cancelMembership({ membershipId: 'mem-1', reason: 'with reservation' });

    expect(res.success).toBe(true);
    void inserts;
    void updates;
    // Reservation released atomically via the RPC, exactly once.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      'release_inventory_unit',
      expect.objectContaining({ p_variant_id: 222, p_reason: 'subscription_release' }),
    );
  });

  it('releases nothing when no pending_payment slot is reserved', async () => {
    install({ reserved: [] });
    const { cancelMembership } = await import('@/features/admin/memberships/actions/cancel-membership');
    const res = await cancelMembership({ membershipId: 'mem-1', reason: 'no reservation' });
    expect(res.success).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('is idempotent: a no-op when the membership is not active/grace/disputed', async () => {
    const { updates } = install({
      membership: { id: 'mem-1', status: 'refunded', shopify_order_id: 555, currency: 'USD', pairs_total: 3 },
    });
    const { cancelMembership } = await import('@/features/admin/memberships/actions/cancel-membership');
    const res = await cancelMembership({ membershipId: 'mem-1', reason: 'dupe' });
    expect(res.success).toBe(true);
    expect(createRefund).not.toHaveBeenCalled();
    expect(updates.length).toBe(0);
  });

  it('can cancel a disputed membership (lost chargeback escalated to refund)', async () => {
    const { updates } = install({
      membership: { id: 'mem-1', status: 'disputed', shopify_order_id: 555, currency: 'USD', pairs_total: 3 },
    });
    const { cancelMembership } = await import('@/features/admin/memberships/actions/cancel-membership');
    const res = await cancelMembership({ membershipId: 'mem-1', reason: 'dispute lost' });
    expect(res.success).toBe(true);
    expect(
      updates.some(
        (u) => u.table === 'subscription_memberships' && u.values.status === 'cancelled',
      ),
    ).toBe(true);
  });

  it('skips the refund call when nothing is refundable (all slots committed)', async () => {
    // No uncommitted slots → refund amount 0, no createRefund. But a committed
    // slot would block the terminal transition via the trigger; here we model a
    // membership with zero uncommitted and no committed (everything already
    // shipped/delivered) so cancel proceeds without money movement.
    const { updates } = install({ redemptions: [{ status: 'delivered' }] });
    const { cancelMembership } = await import('@/features/admin/memberships/actions/cancel-membership');
    const res = await cancelMembership({ membershipId: 'mem-1', reason: 'no refund due' });
    expect(res.success).toBe(true);
    expect(createRefund).not.toHaveBeenCalled();
    expect(
      updates.some(
        (u) => u.table === 'subscription_memberships' && u.values.status === 'cancelled',
      ),
    ).toBe(true);
  });

  it('surfaces a guard-trigger error when a committed slot blocks the transition', async () => {
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: 'mem-1', status: 'active', shopify_order_id: 555, currency: 'USD', pairs_total: 3 },
                  error: null,
                }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            // Simulate the DB guard trigger raising on the terminal transition.
            return {
              eq: () =>
                Promise.resolve({
                  error: { message: 'cannot set membership mem-1 to cancelled while a slot is committed' },
                }),
            };
          },
        };
      }
      if (table === 'subscription_redemptions') {
        return {
          select: () => ({
            eq: () => {
              const p = Promise.resolve({ data: [{ status: 'available' }], error: null }) as Promise<unknown> & {
                eq?: unknown;
              };
              p.eq = () => ({ not: () => Promise.resolve({ data: [], error: null }) });
              return p;
            },
          }),
          update: () => ({ eq: () => ({ in: () => Promise.resolve({ error: null }) }) }),
        };
      }
      if (table === 'audit_log') {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      return {};
    });

    const { cancelMembership } = await import('@/features/admin/memberships/actions/cancel-membership');
    const res = await cancelMembership({ membershipId: 'mem-1', reason: 'blocked' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/committed|slot/i);
  });
});
