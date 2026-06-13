import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (declared before importing the route) ---
const sendEmail = vi.fn();
vi.mock('@/lib/email/resend', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const calculateRefund = vi.fn();
const createRefund = vi.fn();
const getCapturedAmount = vi.fn();
vi.mock('@/lib/commerce/shopify-admin', () => ({
  calculateRefund: (...a: unknown[]) => calculateRefund(...a),
  createRefund: (...a: unknown[]) => createRefund(...a),
  getCapturedAmount: (...a: unknown[]) => getCapturedAmount(...a),
}));

const createAdminClient = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }));

import { GET } from '@/app/api/cron/membership-expiry/route';

const NOW = new Date('2026-06-15T06:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sendEmail.mockResolvedValue({ success: true, providerMessageId: 'm1' });
  calculateRefund.mockResolvedValue({
    refund: { shipping: { amount: '0.00' }, transactions: [{ kind: 'suggested_refund', amount: '150.00' }] },
  });
  // Pro-rata BASE is the ORIGINAL captured amount, not the remaining refundable.
  getCapturedAmount.mockResolvedValue(150);
  createRefund.mockResolvedValue({ refund: { id: 1 } });
});

function req(secret?: string): Request {
  return new Request('https://x/api/cron/membership-expiry', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

/**
 * Minimal supabase mock. `memberships` is the list returned by the active/grace
 * query; `customerEmail` resolves the join; `redemptionCounts` maps membership id
 * to {uncommitted, committed}. Captures all updates/inserts for assertions.
 */
function mockSupabase(opts: {
  memberships: Array<Record<string, unknown>>;
  redemptions: Record<string, Array<{ status: string }>>;
  priorComms?: Array<Record<string, unknown>>;
}) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: opts.memberships, error: null }),
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
            eq: (_c: string, id: string) => ({
              // status list for this membership (status-count read)
              then: (resolve: (v: unknown) => void) =>
                resolve({ data: opts.redemptions[id] ?? [], error: null }),
              in: () => Promise.resolve({ error: null }),
              // releaseReservedSlots read: .eq('status','pending_payment').not(...)
              eq: () => ({ not: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: () => ({ in: () => Promise.resolve({ error: null }) }) };
          },
        };
      }
      if (table === 'customers') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { email: 'a@b.com' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'communications') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: opts.priorComms ?? [], error: null }),
            }),
          }),
          insert: (values: Record<string, unknown>) => {
            inserts.push({ table, values });
            return {
              select: () => ({ single: () => Promise.resolve({ data: { id: 'c1' }, error: null }) }),
            };
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    },
  };
  createAdminClient.mockReturnValue(client);
  return { updates, inserts };
}

describe('membership-expiry cron', () => {
  it('rejects unauthorized requests', async () => {
    mockSupabase({ memberships: [], redemptions: {} });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    mockSupabase({ memberships: [], redemptions: {} });
    const res = await GET(req('wrong'));
    expect(res.status).toBe(401);
  });

  it('sends expiry_warning when term_end falls within a reminder window', async () => {
    // term_end 30 days out, reminder_days includes 30
    const termEnd = new Date(NOW.getTime() + 30 * 86400_000).toISOString();
    const { inserts } = mockSupabase({
      memberships: [
        {
          id: 'mem-1',
          status: 'active',
          customer_id: 'cust-1',
          shopify_order_id: 555,
          currency: 'USD',
          pairs_total: 3,
          term_start: '2025-06-15T00:00:00.000Z',
          term_end: termEnd,
          term_months: 12,
          rollover_count: 0,
          grace_start: null,
          end_of_term_policy: { mode: 'refund', reminder_days: [60, 30, 7], grace_days: 14 },
        },
      ],
      redemptions: { 'mem-1': [{ status: 'available' }, { status: 'available' }] },
    });

    const res = await GET(req('test-secret'));
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(
      inserts.some(
        (i) =>
          i.table === 'communications' &&
          i.values.type === 'expiry_warning' &&
          (i.values.metadata as { reminder_day?: number }).reminder_day === 30,
      ),
    ).toBe(true);
  });

  it('does not resend an expiry_warning already recorded for that day', async () => {
    const termEnd = new Date(NOW.getTime() + 30 * 86400_000).toISOString();
    mockSupabase({
      memberships: [
        {
          id: 'mem-1',
          status: 'active',
          customer_id: 'cust-1',
          shopify_order_id: 555,
          currency: 'USD',
          pairs_total: 3,
          term_start: '2025-06-15T00:00:00.000Z',
          term_end: termEnd,
          term_months: 12,
          rollover_count: 0,
          grace_start: null,
          end_of_term_policy: { mode: 'refund', reminder_days: [60, 30, 7], grace_days: 14 },
        },
      ],
      redemptions: { 'mem-1': [{ status: 'available' }] },
      priorComms: [{ metadata: { membership_id: 'mem-1', reminder_day: 30 }, status: 'sent' }],
    });

    await GET(req('test-secret'));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('moves active -> grace at term_end', async () => {
    const termEnd = new Date(NOW.getTime() - 1 * 86400_000).toISOString(); // 1 day past
    const { updates } = mockSupabase({
      memberships: [
        {
          id: 'mem-1',
          status: 'active',
          customer_id: 'cust-1',
          shopify_order_id: 555,
          currency: 'USD',
          pairs_total: 3,
          term_start: '2025-06-15T00:00:00.000Z',
          term_end: termEnd,
          term_months: 12,
          rollover_count: 0,
          grace_start: null,
          end_of_term_policy: { mode: 'refund', reminder_days: [60, 30, 7], grace_days: 14 },
        },
      ],
      redemptions: { 'mem-1': [{ status: 'available' }] },
    });

    await GET(req('test-secret'));
    expect(
      updates.some(
        (u) =>
          u.table === 'subscription_memberships' &&
          u.values.status === 'grace' &&
          u.values.grace_start != null,
      ),
    ).toBe(true);
  });

  it('applies end-of-term (refund) at term_end + grace_days', async () => {
    const termEnd = new Date(NOW.getTime() - 20 * 86400_000).toISOString(); // 20 days past > 14 grace
    const graceStart = new Date(NOW.getTime() - 20 * 86400_000).toISOString();
    const { updates } = mockSupabase({
      memberships: [
        {
          id: 'mem-1',
          status: 'grace',
          customer_id: 'cust-1',
          shopify_order_id: 555,
          currency: 'USD',
          pairs_total: 3,
          term_start: '2025-06-15T00:00:00.000Z',
          term_end: termEnd,
          term_months: 12,
          rollover_count: 0,
          grace_start: graceStart,
          end_of_term_policy: { mode: 'refund', reminder_days: [60, 30, 7], grace_days: 14 },
        },
      ],
      redemptions: { 'mem-1': [{ status: 'available' }, { status: 'available' }] }, // 2 uncommitted
    });

    await GET(req('test-secret'));
    // pro-rata 2/3 * 150 = 100
    expect(createRefund).toHaveBeenCalledWith(555, 100, 'USD', expect.any(String));
    expect(
      updates.some(
        (u) => u.table === 'subscription_memberships' && u.values.status === 'refunded',
      ),
    ).toBe(true);
  });

  it('C7: does NOT mark refunded (or refund) when Shopify capture lookup fails', async () => {
    getCapturedAmount.mockRejectedValueOnce(new Error('Shopify 503'));
    const termEnd = new Date(NOW.getTime() - 20 * 86400_000).toISOString();
    const graceStart = new Date(NOW.getTime() - 20 * 86400_000).toISOString();
    const { updates } = mockSupabase({
      memberships: [
        {
          id: 'mem-1',
          status: 'grace',
          customer_id: 'cust-1',
          shopify_order_id: 555,
          currency: 'USD',
          pairs_total: 3,
          term_start: '2025-06-15T00:00:00.000Z',
          term_end: termEnd,
          term_months: 12,
          rollover_count: 0,
          grace_start: graceStart,
          end_of_term_policy: { mode: 'refund', reminder_days: [], grace_days: 14 },
        },
      ],
      redemptions: { 'mem-1': [{ status: 'available' }, { status: 'available' }] },
    });

    const res = await GET(req('test-secret'));
    const body = await res.json();

    // No refund issued, membership left intact (not 'refunded'/'expired'), and the
    // failure is surfaced — the slot is retried on the next tick.
    expect(createRefund).not.toHaveBeenCalled();
    expect(
      updates.some((u) => u.table === 'subscription_memberships' && u.values.status === 'refunded'),
    ).toBe(false);
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });

  it('pro-rates end-of-term on the ORIGINAL captured base after a prior partial refund (not remaining)', async () => {
    // Order captured 150; a prior partial refund leaves 120 remaining-refundable.
    // 2-of-3 unredeemed must pro-rate on 150 → 100.00, NOT on 120 → 80.00.
    getCapturedAmount.mockResolvedValueOnce(150);
    calculateRefund.mockResolvedValueOnce({
      refund: { shipping: { amount: '0.00' }, transactions: [{ kind: 'suggested_refund', amount: '120.00' }] },
    });
    const termEnd = new Date(NOW.getTime() - 20 * 86400_000).toISOString();
    const graceStart = new Date(NOW.getTime() - 20 * 86400_000).toISOString();
    mockSupabase({
      memberships: [
        {
          id: 'mem-1',
          status: 'grace',
          customer_id: 'cust-1',
          shopify_order_id: 555,
          currency: 'USD',
          pairs_total: 3,
          term_start: '2025-06-15T00:00:00.000Z',
          term_end: termEnd,
          term_months: 12,
          rollover_count: 0,
          grace_start: graceStart,
          end_of_term_policy: { mode: 'refund', reminder_days: [], grace_days: 14 },
        },
      ],
      redemptions: { 'mem-1': [{ status: 'available' }, { status: 'available' }] }, // 2 uncommitted
    });

    await GET(req('test-secret'));
    // Base from getCapturedAmount (150), not remaining 120 → refund 100, not 80.
    expect(getCapturedAmount).toHaveBeenCalledWith(555, 'USD');
    expect(createRefund).toHaveBeenCalledWith(555, 100, 'USD', expect.any(String));
  });

  it('reports an error (not success) when the terminal membership update is rejected by the guard', async () => {
    // No committed slot is visible at count time, but the terminal membership
    // update is rejected (a slot raced into a committed state). applyEndOfTerm
    // must surface it and the cron must record it as an error — NOT count `ended`
    // or report success — even though slots were already expired and (refund
    // mode) a refund already went out.
    const termEnd = new Date(NOW.getTime() - 20 * 86400_000).toISOString();
    const graceStart = new Date(NOW.getTime() - 20 * 86400_000).toISOString();

    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    const client = {
      from(table: string) {
        if (table === 'subscription_memberships') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'mem-9',
                      status: 'grace',
                      customer_id: 'cust-9',
                      shopify_order_id: 999,
                      currency: 'USD',
                      pairs_total: 3,
                      term_start: '2025-06-15T00:00:00.000Z',
                      term_end: termEnd,
                      term_months: 12,
                      rollover_count: 0,
                      grace_start: graceStart,
                      end_of_term_policy: { mode: 'refund', reminder_days: [], grace_days: 14 },
                    },
                  ],
                  error: null,
                }),
            }),
            update: (values: Record<string, unknown>) => {
              updates.push({ table, values });
              // Simulate the DB guard raising on the terminal transition.
              return {
                eq: () =>
                  Promise.resolve({
                    error: { message: 'cannot set membership mem-9 to refunded while a slot is committed' },
                  }),
              };
            },
          };
        }
        if (table === 'subscription_redemptions') {
          return {
            select: () => ({
              eq: () => ({
                then: (resolve: (v: unknown) => void) =>
                  resolve({ data: [{ status: 'available' }, { status: 'available' }], error: null }),
                // releaseReservedSlots: .eq().eq().not()
                eq: () => ({ not: () => Promise.resolve({ data: [], error: null }) }),
                in: () => Promise.resolve({ error: null }),
              }),
            }),
            update: () => ({ eq: () => ({ in: () => Promise.resolve({ error: null }) }) }),
          };
        }
        return {};
      },
    };
    createAdminClient.mockReturnValue(client);

    const res = await GET(req('test-secret'));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.ended).toBe(0);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0].membershipId).toBe('mem-9');
  });

  it('skips end-of-term while a slot is committed (guard)', async () => {
    const termEnd = new Date(NOW.getTime() - 20 * 86400_000).toISOString();
    const graceStart = new Date(NOW.getTime() - 20 * 86400_000).toISOString();
    const { updates } = mockSupabase({
      memberships: [
        {
          id: 'mem-1',
          status: 'grace',
          customer_id: 'cust-1',
          shopify_order_id: 555,
          currency: 'USD',
          pairs_total: 3,
          term_start: '2025-06-15T00:00:00.000Z',
          term_end: termEnd,
          term_months: 12,
          rollover_count: 0,
          grace_start: graceStart,
          end_of_term_policy: { mode: 'refund', reminder_days: [60, 30, 7], grace_days: 14 },
        },
      ],
      redemptions: { 'mem-1': [{ status: 'awaiting_rx' }, { status: 'available' }] }, // committed present
    });

    await GET(req('test-secret'));
    expect(createRefund).not.toHaveBeenCalled();
    expect(
      updates.some(
        (u) => u.table === 'subscription_memberships' && u.values.status === 'refunded',
      ),
    ).toBe(false);
  });

  it('treats a live pending_payment slot as UNCOMMITTED: end-of-term proceeds and releases its reservation', async () => {
    // Finding 2 reconciliation: pending_payment is NOT committed. With only a
    // pending_payment slot live, the membership reaches its terminal state (it is
    // NOT skipped/blocked) — its reserved frame unit is released first.
    const termEnd = new Date(NOW.getTime() - 20 * 86400_000).toISOString();
    const graceStart = new Date(NOW.getTime() - 20 * 86400_000).toISOString();

    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        return Promise.resolve({ data: 'pool-pp', error: null });
      },
      from(table: string) {
        if (table === 'subscription_memberships') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'mem-pp',
                      status: 'grace',
                      customer_id: 'cust-pp',
                      shopify_order_id: 321,
                      currency: 'USD',
                      pairs_total: 3,
                      term_start: '2025-06-15T00:00:00.000Z',
                      term_end: termEnd,
                      term_months: 12,
                      rollover_count: 0,
                      grace_start: graceStart,
                      end_of_term_policy: { mode: 'expire', reminder_days: [], grace_days: 14 },
                    },
                  ],
                  error: null,
                }),
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
              eq: () => ({
                // status-count read: one pending_payment slot (no committed slots)
                then: (resolve: (v: unknown) => void) =>
                  resolve({ data: [{ status: 'pending_payment' }], error: null }),
                // releaseReservedSlots read: the reserved pending_payment slot
                eq: () => ({
                  not: () =>
                    Promise.resolve({ data: [{ id: 'slot-pp', frame_variant_id: 222 }], error: null }),
                }),
                in: () => Promise.resolve({ error: null }),
              }),
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
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'pool-pp', pool_quantity: 1 }, error: null }) }),
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
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: 'a@b.com' }, error: null }) }) }),
          };
        }
        if (table === 'communications') {
          return {
            select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
            insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'c1' }, error: null }) }) }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }
        return {};
      },
    };
    createAdminClient.mockReturnValue(client);

    const res = await GET(req('test-secret'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.skipped).toBe(0);
    expect(body.ended).toBe(1);
    // Terminal transition proceeded (NOT blocked).
    expect(
      updates.some((u) => u.table === 'subscription_memberships' && u.values.status === 'expired'),
    ).toBe(true);
    // The pending_payment reservation was released atomically via the RPC.
    void inserts;
    expect(
      rpcCalls.some(
        (c) =>
          c.fn === 'release_inventory_unit' &&
          c.args.p_variant_id === 222 &&
          c.args.p_reason === 'subscription_release',
      ),
    ).toBe(true);
  });
});
