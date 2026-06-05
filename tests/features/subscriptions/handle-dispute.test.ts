import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();

beforeEach(() => from.mockReset());

describe('handleDisputeWebhook', () => {
  it('freezes an active membership to disputed and writes an audit_log entry', async () => {
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

    from.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'mem-1', status: 'active' }, error: null }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: () => Promise.resolve({ error: null }) };
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

    const { handleDisputeWebhook } = await import('@/features/subscriptions/webhooks/handle-dispute');
    const res = await handleDisputeWebhook({ order_id: 555 }, { from } as never);

    expect(res.handled).toBe('membership');
    expect(
      updates.some(
        (u) => u.table === 'subscription_memberships' && u.values.status === 'disputed',
      ),
    ).toBe(true);
    expect(inserts.some((i) => i.table === 'audit_log')).toBe(true);
  });

  it('is idempotent: an already-disputed membership is not re-processed', async () => {
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

    from.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'mem-1', status: 'disputed' }, error: null }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: () => Promise.resolve({ error: null }) };
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

    const { handleDisputeWebhook } = await import('@/features/subscriptions/webhooks/handle-dispute');
    const res = await handleDisputeWebhook({ order_id: 555 }, { from } as never);
    expect(res.handled).toBe('membership');
    expect(updates.length).toBe(0);
    expect(inserts.length).toBe(0);
  });

  it('is a no-op for orders that match no membership', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      return {};
    });

    const { handleDisputeWebhook } = await import('@/features/subscriptions/webhooks/handle-dispute');
    const res = await handleDisputeWebhook({ order_id: 999 }, { from } as never);
    expect(res.handled).toBe('none');
  });

  it('reads order_id from a nested payload.order_id field', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: (_col: string, val: unknown) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: val === 321 ? { id: 'mem-2', status: 'active' } : null,
                  error: null,
                }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === 'audit_log') {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      return {};
    });

    const { handleDisputeWebhook } = await import('@/features/subscriptions/webhooks/handle-dispute');
    const res = await handleDisputeWebhook({ order_id: 321 }, { from } as never);
    expect(res.handled).toBe('membership');
  });
});

// --- startRedemption: a disputed membership blocks redemption ----------------
const getCurrentCustomer = vi.fn();
vi.mock('@/lib/auth/customer', () => ({
  getCurrentCustomer: () => getCurrentCustomer(),
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/commerce/shopify', () => ({
  createCart: vi.fn(),
}));

vi.mock('@/features/subscriptions/redemption-order', () => ({
  createRedemptionFulfillmentOrder: vi.fn(),
}));

describe('startRedemption — disputed membership gate', () => {
  it('refuses to start a redemption when the membership is disputed', async () => {
    getCurrentCustomer.mockResolvedValue({ id: 'cust-1' });

    const slotRow = {
      id: 'slot-1',
      status: 'available',
      membership_id: 'mem-1',
      subscription_memberships: {
        id: 'mem-1',
        customer_id: 'cust-1',
        status: 'disputed',
        currency: 'usd',
        customers: { email: 'a@b.com' },
      },
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'subscription_redemptions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: slotRow, error: null }) }),
          }),
        };
      }
      return {};
    });

    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    const res = await startRedemption({
      slotId: 'slot-1',
      frameVariantId: 111,
      lensConfig: {},
      shipTo: { country_code: 'US' },
    } as never);

    expect('error' in res && res.error).toBeTruthy();
  });
});
