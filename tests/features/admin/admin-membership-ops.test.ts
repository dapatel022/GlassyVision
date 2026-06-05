import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: () => getCurrentUser(),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

const sendEmail = vi.fn();
vi.mock('@/lib/email/resend', () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

import {
  expireMembership,
  freezeMembership,
  unfreezeMembership,
  resendMembershipEmail,
  resolveDispute,
} from '@/features/admin/memberships/actions/admin-membership-ops';

const UNCOMMITTED = ['available', 'locked', 'pending_payment'];

interface InstallOpts {
  membership?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
  /** Reserved pending_payment slots returned to releaseReservedSlots. */
  reserved?: Array<{ id: string; frame_variant_id: number | null }>;
}

function install(o: InstallOpts = {}) {
  const membership =
    'membership' in o
      ? o.membership
      : {
          id: 'mem-1',
          status: 'active',
          shopify_order_id: 555,
          currency: 'USD',
          pairs_total: 3,
          customer_id: 'cust-1',
        };
  const reserved = o.reserved ?? [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const slotUpdates: Array<{ values: Record<string, unknown>; inFilter?: string[] }> = [];

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
        // releaseReservedSlots: .select().eq().eq().not()
        select: () => ({
          eq: () => ({ eq: () => ({ not: () => Promise.resolve({ data: reserved, error: null }) }) }),
        }),
        update: (values: Record<string, unknown>) => {
          const entry: { values: Record<string, unknown>; inFilter?: string[] } = { values };
          slotUpdates.push(entry);
          return {
            eq: () => ({
              in: (_col: string, arr: string[]) => {
                entry.inFilter = arr;
                return Promise.resolve({ error: null });
              },
            }),
          };
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
    if (table === 'customers') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: o.customer ?? { email: 'm@x.com', first_name: 'Mira' },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === 'communications') {
      return {
        insert: (values: Record<string, unknown>) => {
          inserts.push({ table, values });
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'c-1' }, error: null }) }) };
        },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
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

  return { updates, inserts, slotUpdates };
}

beforeEach(() => {
  mockFrom.mockReset();
  getCurrentUser.mockReset();
  sendEmail.mockReset();
  getCurrentUser.mockResolvedValue({ id: 'f-1', email: 'f@x.com', role: 'founder', fullName: 'F' });
  sendEmail.mockResolvedValue({ success: true, providerMessageId: 'pm-1' });
});

describe('expireMembership', () => {
  it('rejects a non-admin', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u', email: 'u@x', role: 'pending', fullName: null });
    install();
    const res = await expireMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/forbidden/i);
  });

  it('expires uncommitted slots, sets membership expired, audit-logs', async () => {
    const { updates, inserts, slotUpdates } = install();
    const res = await expireMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(true);

    const slot = slotUpdates[0];
    expect(slot.values.status).toBe('expired');
    expect(slot.inFilter).toEqual(UNCOMMITTED);

    const memUpdate = updates.find((u) => u.values.status === 'expired');
    expect(memUpdate).toBeDefined();

    const audit = inserts.find((i) => i.table === 'audit_log');
    expect(audit!.values.action).toBe('membership_expired_manual');
  });

  it('releases inventory reserved by a pending_payment slot before expiring it', async () => {
    const { inserts, updates } = install({ reserved: [{ id: 'slot-1', frame_variant_id: 222 }] });
    const res = await expireMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(true);
    expect(
      inserts.filter(
        (i) =>
          i.table === 'inventory_adjustments' &&
          i.values.delta === 1 &&
          i.values.reason === 'subscription_release',
      ).length,
    ).toBe(1);
    expect(
      updates.some((u) => u.table === 'inventory_pool' && u.values.pool_quantity === 4),
    ).toBe(true);
  });

  it('releases nothing when no pending_payment slot is reserved', async () => {
    const { inserts } = install({ reserved: [] });
    const res = await expireMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(true);
    expect(inserts.some((i) => i.table === 'inventory_adjustments')).toBe(false);
  });

  it('is a no-op when membership is already in a terminal state', async () => {
    const { updates } = install({
      membership: { id: 'mem-1', status: 'refunded', shopify_order_id: 1, currency: 'USD', pairs_total: 3, customer_id: 'c' },
    });
    const res = await expireMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(true);
    expect(updates.find((u) => u.values.status === 'expired')).toBeUndefined();
  });
});

describe('freeze / unfreeze', () => {
  it('freeze sets status frozen and audit-logs', async () => {
    const { updates, inserts } = install();
    const res = await freezeMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(true);
    expect(updates.find((u) => u.values.status === 'frozen')).toBeDefined();
    expect(inserts.find((i) => i.table === 'audit_log')!.values.action).toBe('membership_frozen');
  });

  it('freeze rejects a non-admin', async () => {
    getCurrentUser.mockResolvedValue(null);
    install();
    const res = await freezeMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(false);
  });

  it('unfreeze restores a frozen membership to active', async () => {
    const { updates, inserts } = install({
      membership: { id: 'mem-1', status: 'frozen', shopify_order_id: 1, currency: 'USD', pairs_total: 3, customer_id: 'c' },
    });
    const res = await unfreezeMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(true);
    expect(updates.find((u) => u.values.status === 'active')).toBeDefined();
    expect(inserts.find((i) => i.table === 'audit_log')!.values.action).toBe('membership_unfrozen');
  });

  it('unfreeze refuses to act on a non-frozen membership', async () => {
    const { updates } = install();
    const res = await unfreezeMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(false);
    expect(updates.find((u) => u.values.status === 'active')).toBeUndefined();
  });
});

describe('expireMembership — disputed exit', () => {
  it('can expire a disputed membership (lost chargeback, no auto-refund)', async () => {
    const { updates } = install({
      membership: { id: 'mem-1', status: 'disputed', shopify_order_id: 1, currency: 'USD', pairs_total: 3, customer_id: 'c' },
    });
    const res = await expireMembership({ membershipId: 'mem-1' });
    expect(res.success).toBe(true);
    expect(updates.find((u) => u.values.status === 'expired')).toBeDefined();
  });
});

describe('resolveDispute', () => {
  it('rejects a non-admin', async () => {
    getCurrentUser.mockResolvedValue(null);
    install({ membership: { id: 'mem-1', status: 'disputed', shopify_order_id: 1, currency: 'USD', pairs_total: 3, customer_id: 'c' } });
    const res = await resolveDispute({ membershipId: 'mem-1' });
    expect(res.success).toBe(false);
  });

  it('returns a disputed membership to active (merchant won) and audit-logs', async () => {
    const { updates, inserts } = install({
      membership: { id: 'mem-1', status: 'disputed', shopify_order_id: 1, currency: 'USD', pairs_total: 3, customer_id: 'c' },
    });
    const res = await resolveDispute({ membershipId: 'mem-1' });
    expect(res.success).toBe(true);
    expect(updates.find((u) => u.values.status === 'active')).toBeDefined();
    expect(inserts.find((i) => i.table === 'audit_log')!.values.action).toBe('membership_dispute_resolved');
  });

  it('refuses to act on a non-disputed membership', async () => {
    const { updates } = install();
    const res = await resolveDispute({ membershipId: 'mem-1' });
    expect(res.success).toBe(false);
    expect(updates.find((u) => u.values.status === 'active')).toBeUndefined();
  });
});

describe('resendMembershipEmail', () => {
  it('rejects a non-admin', async () => {
    getCurrentUser.mockResolvedValue(null);
    install();
    const res = await resendMembershipEmail({ membershipId: 'mem-1', type: 'membership_welcome' });
    expect(res.success).toBe(false);
  });

  it('renders and sends the requested lifecycle email, logs communications + audit', async () => {
    const { inserts } = install();
    const res = await resendMembershipEmail({ membershipId: 'mem-1', type: 'membership_welcome' });
    expect(res.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(inserts.find((i) => i.table === 'communications')).toBeDefined();
    expect(inserts.find((i) => i.table === 'audit_log')!.values.action).toBe('membership_email_resent');
  });

  it('fails gracefully when the customer has no email on file', async () => {
    install({ customer: { email: null, first_name: 'X' } });
    const res = await resendMembershipEmail({ membershipId: 'mem-1', type: 'membership_welcome' });
    expect(res.success).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
