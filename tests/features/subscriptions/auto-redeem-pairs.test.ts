import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';

const createRedemptionFulfillmentOrder = vi.fn();
vi.mock('@/features/subscriptions/redemption-order', () => ({
  createRedemptionFulfillmentOrder: (...a: unknown[]) => createRedemptionFulfillmentOrder(...a),
}));
vi.mock('@/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }) }));

// --- minimal chainable Supabase stub -------------------------------------
interface StubState {
  slots: Array<{ id: string; slot_index: number; status: string }>;
  premiumVariantIds: number[];
  reserveFailsFor: number[];       // frame variant ids whose reservation fails
  audits: Array<Record<string, unknown>>;
  slotUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
}
let state: StubState;

function stubSupabase() {
  return {
    from(table: string) {
      if (table === 'subscription_redemptions') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: state.slots.filter((s) => s.status === 'available').slice(0, 1), error: null }) }) }) }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_c: string, id: string) => ({
              eq: () => ({
                select: () => {
                  const slot = state.slots.find((s) => s.id === id && s.status === 'available');
                  if (slot && patch.status === 'locked') { slot.status = 'locked'; state.slotUpdates.push({ id, patch }); return Promise.resolve({ data: [{ id }], error: null }); }
                  return Promise.resolve({ data: [], error: null });
                },
              }),
              then: (resolve: (v: { data: null; error: null }) => void) => {
                // plain .update().eq(id) — status transitions and reverts
                const slot = state.slots.find((s) => s.id === id);
                if (slot && typeof patch.status === 'string') slot.status = patch.status;
                state.slotUpdates.push({ id, patch });
                resolve({ data: null, error: null });
              },
            }),
          }),
        };
      }
      if (table === 'product_metadata') {
        return { select: () => ({ eq: (_c: string, v: number) => ({ maybeSingle: () => Promise.resolve({ data: state.premiumVariantIds.includes(v) ? { subscription_tier: 'premium' } : null, error: null }) }) }) };
      }
      if (table === 'audit_log') {
        return { insert: (row: Record<string, unknown>) => { state.audits.push(row); return Promise.resolve({ data: null, error: null }); } };
      }
      if (table === 'communications') {
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'comm1' }, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (_fn: string, args: { p_variant_id: number }) =>
      Promise.resolve(state.reserveFailsFor.includes(args.p_variant_id)
        ? { data: null, error: null }
        : { data: 'pool-1', error: null }),
  };
}
// -------------------------------------------------------------------------

const CTX = {
  membershipId: 'm1', orderId: 'o1', customerId: 'c1',
  customerEmail: 'buyer@example.com', currency: 'usd',
  shipTo: { country_code: 'US' },
};
const RX_PAIR: PairConfig = { v: 501, h: 'dusk-wayfarer', l: 'single_vision', u: [], t: 'none' };
const PLANO_PAIR: PairConfig = { v: 502, h: 'marina-oval-sun', l: 'non_rx', u: ['photochromic'], t: 'grey' };

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    slots: [{ id: 's1', slot_index: 0, status: 'available' }, { id: 's2', slot_index: 1, status: 'available' }, { id: 's3', slot_index: 2, status: 'available' }],
    premiumVariantIds: [], reserveFailsFor: [], audits: [], slotUpdates: [],
  };
  createRedemptionFulfillmentOrder.mockImplementation((r: { lens_config: { lens_type: string } }) =>
    Promise.resolve({ orderId: 'ro1', lineItemId: 'rl1', hasRxItems: r.lens_config.lens_type !== 'plano' }));
});

describe('autoRedeemConfiguredPairs', () => {
  it('redeems each configured pair: Rx → awaiting_rx, plano → awaiting_fulfillment', async () => {
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 2, fallbacks: 0 });
    const statuses = state.slotUpdates.filter((u) => u.patch.internal_order_id).map((u) => u.patch.status);
    expect(statuses).toEqual(['awaiting_rx', 'awaiting_fulfillment']);
  });

  it('passes the plano lens vocabulary to the synthesized order', async () => {
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    await autoRedeemConfiguredPairs([PLANO_PAIR], CTX, stubSupabase() as never);
    expect(createRedemptionFulfillmentOrder.mock.calls[0][0].lens_config.lens_type).toBe('plano');
  });

  it('out-of-stock pair falls back: slot reverted, audit written, others continue', async () => {
    state.reserveFailsFor = [501];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
    expect(state.audits[0]).toMatchObject({ action: 'auto_redeem_pair_failed' });
    expect((state.audits[0].after_data as { reason: string }).reason).toBe('out_of_stock');
    const revert = state.slotUpdates.find((u) => u.patch.status === 'available');
    expect(revert).toBeTruthy();
  });

  it('non-dispensable destination fails ALL pairs closed with audits', async () => {
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], { ...CTX, shipTo: { country_code: 'GB' } }, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 2 });
    expect(state.audits).toHaveLength(2);
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('a throwing pair is audited and does not break the batch', async () => {
    createRedemptionFulfillmentOrder
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ orderId: 'ro2', lineItemId: 'rl2', hasRxItems: false });
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
    expect((state.audits[0].after_data as { reason: string }).reason).toContain('boom');
  });
});
