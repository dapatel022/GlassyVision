import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';

const createRedemptionFulfillmentOrder = vi.fn();
vi.mock('@/features/subscriptions/redemption-order', () => ({
  createRedemptionFulfillmentOrder: (...a: unknown[]) => createRedemptionFulfillmentOrder(...a),
}));
const sendEmail = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/email/resend', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

// --- minimal but faithful chainable Supabase stub ------------------------
interface Slot {
  id: string;
  slot_index: number;
  status: string;
  membership_id: string;
}
interface DbError {
  message: string;
}
interface StubState {
  slots: Slot[];
  premiumVariantIds: number[];
  notRxCapableVariantIds: number[];       // C2: variants with is_rx_capable=false
  metadataErrorFor: number[];             // N2: variants whose product_metadata query errors
  reserveFailsFor: number[];              // frame variant ids whose reservation fails
  releaseRejects: boolean;                // N1: release_inventory_unit rpc rejects instead of resolving
  selectError: DbError | null;            // error on the slot-select query
  claimError: DbError | null;             // error on the claim update
  revertFailFor: string[];                // slot ids whose revert-to-available write errors
  statusUpdateFailFor: string[];          // slot ids whose post-order status write errors
  auditShouldFail: boolean;               // audit_log.insert errors
  commsInsertShouldFail: boolean;         // communications.insert errors (e.g. missing enum value)
  priorFallbackComms: Array<{ metadata: unknown; status: string }>; // existing pair_fallback rows (dedupe)
  audits: Array<Record<string, unknown>>;
  slotUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
  releaseCalls: Array<{ p_variant_id: number; p_redemption_id?: string; p_reason?: string }>;
}
let state: StubState;

function matches(row: Slot, filters: Array<[string, unknown]>): boolean {
  return filters.every(([col, val]) => (row as unknown as Record<string, unknown>)[col] === val);
}

function stubSupabase() {
  return {
    from(table: string) {
      if (table === 'subscription_redemptions') {
        return {
          select: () => {
            const filters: Array<[string, unknown]> = [];
            const chain = {
              eq(col: string, val: unknown) { filters.push([col, val]); return chain; },
              order(_col: string, _opts?: unknown) { return chain; },
              limit: (n: number) => {
                if (state.selectError) return Promise.resolve({ data: null, error: state.selectError });
                const rows = state.slots
                  .filter((s) => matches(s, filters))
                  .sort((a, b) => a.slot_index - b.slot_index)
                  .slice(0, n);
                return Promise.resolve({ data: rows, error: null });
              },
            };
            return chain;
          },
          update: (patch: Record<string, unknown>) => {
            const filters: Array<[string, unknown]> = [];
            const chain = {
              eq(col: string, val: unknown) { filters.push([col, val]); return chain; },
              select: (_cols?: string) => {
                // .update(patch).eq('id', id).eq('status', 'available').select('id') — the claim
                if (state.claimError) return Promise.resolve({ data: null, error: state.claimError });
                const slot = state.slots.find((s) => matches(s, filters));
                if (slot && patch.status === 'locked' && slot.status === 'available') {
                  Object.assign(slot, patch);
                  state.slotUpdates.push({ id: slot.id, patch });
                  return Promise.resolve({ data: [{ id: slot.id }], error: null });
                }
                return Promise.resolve({ data: [], error: null });
              },
              then: (resolve: (v: { data: null; error: unknown }) => void) => {
                // plain .update(patch).eq('id', id) — reverts and post-order status writes
                const idFilter = filters.find(([c]) => c === 'id');
                const id = idFilter?.[1] as string | undefined;
                let err: unknown = null;
                if (patch.status === 'available' && id && state.revertFailFor.includes(id)) {
                  err = { message: 'revert write failed' };
                } else if (
                  (patch.status === 'awaiting_rx' || patch.status === 'awaiting_fulfillment') &&
                  id && state.statusUpdateFailFor.includes(id)
                ) {
                  err = { message: 'status update write failed' };
                }
                if (!err) {
                  const slot = id ? state.slots.find((s) => s.id === id) : undefined;
                  if (slot) Object.assign(slot, patch);
                  state.slotUpdates.push({ id: id ?? 'unknown', patch });
                }
                resolve({ data: null, error: err });
              },
            };
            return chain;
          },
        };
      }
      if (table === 'product_metadata') {
        return {
          select: () => ({
            eq: (_c: string, v: number) => ({
              maybeSingle: () => state.metadataErrorFor.includes(v)
                ? Promise.resolve({ data: null, error: { message: 'metadata query timed out' } })
                : Promise.resolve({
                    data: {
                      subscription_tier: state.premiumVariantIds.includes(v) ? 'premium' : null,
                      is_rx_capable: !state.notRxCapableVariantIds.includes(v),
                    },
                    error: null,
                  }),
            }),
          }),
        };
      }
      if (table === 'audit_log') {
        return {
          insert: (row: Record<string, unknown>) => {
            if (state.auditShouldFail) return Promise.resolve({ data: null, error: { message: 'audit insert failed' } });
            state.audits.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === 'communications') {
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: state.priorFallbackComms, error: null }) }) }),
          insert: () => ({
            select: () => ({
              single: () => state.commsInsertShouldFail
                ? Promise.resolve({ data: null, error: { message: 'invalid input value for enum comm_type: "pair_fallback"' } })
                : Promise.resolve({ data: { id: 'comm1' }, error: null }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'reserve_inventory_unit') {
        return Promise.resolve(
          state.reserveFailsFor.includes(args.p_variant_id as number)
            ? { data: null, error: null }
            : { data: 'pool-1', error: null },
        );
      }
      if (fn === 'release_inventory_unit') {
        state.releaseCalls.push(args as { p_variant_id: number; p_redemption_id?: string; p_reason?: string });
        if (state.releaseRejects) return Promise.reject(new Error('release rpc network error'));
        return Promise.resolve({ data: 'pool-1', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
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

function reason(row: Record<string, unknown>): string {
  return (row.after_data as { reason: string }).reason;
}

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    slots: [
      { id: 's1', slot_index: 0, status: 'available', membership_id: 'm1' },
      { id: 's2', slot_index: 1, status: 'available', membership_id: 'm1' },
      { id: 's3', slot_index: 2, status: 'available', membership_id: 'm1' },
    ],
    premiumVariantIds: [], notRxCapableVariantIds: [], metadataErrorFor: [],
    reserveFailsFor: [], releaseRejects: false,
    selectError: null, claimError: null, revertFailFor: [], statusUpdateFailFor: [],
    auditShouldFail: false, commsInsertShouldFail: false, priorFallbackComms: [],
    audits: [], slotUpdates: [], releaseCalls: [],
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

  it('out-of-stock pair falls back: slot reverted (PII cleared), audit written, others continue', async () => {
    state.reserveFailsFor = [501];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
    expect(state.audits[0]).toMatchObject({ action: 'auto_redeem_pair_failed' });
    expect(reason(state.audits[0])).toBe('out_of_stock');
    const revert = state.slotUpdates.find((u) => u.patch.status === 'available');
    expect(revert).toBeTruthy();
    expect(revert?.patch).toMatchObject({ frame_variant_id: null, lens_config: {}, ship_to: null });
  });

  it('non-dispensable destination fails ALL pairs closed with audits', async () => {
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], { ...CTX, shipTo: { country_code: 'GB' } }, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 2 });
    expect(state.audits).toHaveLength(2);
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('a throwing pair is audited, does not break the batch, and releases its reserved inventory before reverting (PII cleared)', async () => {
    createRedemptionFulfillmentOrder
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ orderId: 'ro2', lineItemId: 'rl2', hasRxItems: false });
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
    expect(reason(state.audits[0])).toContain('boom');
    expect(state.releaseCalls).toEqual([
      expect.objectContaining({ p_variant_id: 501, p_redemption_id: 's1', p_reason: 'subscription_release' }),
    ]);
    const revert = state.slotUpdates.find((u) => u.id === 's1' && u.patch.status === 'available');
    expect(revert?.patch).toMatchObject({ frame_variant_id: null, lens_config: {}, ship_to: null });
  });

  it('C2: an Rx-intent pair on a non-Rx-capable frame fails closed BEFORE claiming a slot', async () => {
    state.notRxCapableVariantIds = [501];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 1 });
    expect(reason(state.audits[0])).toBe('frame_not_rx_capable');
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
    // the slot was never touched — no claim, no revert
    expect(state.slotUpdates).toHaveLength(0);
  });

  it('C2: an Rx-intent pair whose synthesized order comes back non-Rx is rejected post-hoc, releasing inventory and reverting', async () => {
    createRedemptionFulfillmentOrder.mockResolvedValueOnce({ orderId: 'ro-mismatch', lineItemId: 'rl-mismatch', hasRxItems: false });
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 1 });
    expect(reason(state.audits[0])).toBe('rx_routing_mismatch');
    expect(state.audits[0].after_data).toMatchObject({ synthesized_order_id: 'ro-mismatch' });
    expect(state.releaseCalls).toEqual([expect.objectContaining({ p_variant_id: 501, p_reason: 'subscription_release' })]);
    const revert = state.slotUpdates.find((u) => u.patch.status === 'available');
    expect(revert?.patch).toMatchObject({ frame_variant_id: null, lens_config: {}, ship_to: null });
  });

  it('exhausts available slots: extra configs fall back with no_available_slot', async () => {
    state.slots = [{ id: 's1', slot_index: 0, status: 'available', membership_id: 'm1' }];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
    expect(reason(state.audits[0])).toBe('no_available_slot');
  });

  it('I4: a failing post-order status write is audited as status_update_failed and NOT counted as redeemed', async () => {
    state.statusUpdateFailFor = ['s1'];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 0 });
    expect(state.audits).toHaveLength(1);
    expect(reason(state.audits[0])).toBe('status_update_failed');
    expect(state.audits[0].after_data).toMatchObject({ slot_id: 's1', synthesized_order_id: 'ro1' });
  });

  it('I4: a failing revert write (after out-of-stock) is separately audited as status_update_failed', async () => {
    state.reserveFailsFor = [501];
    state.revertFailFor = ['s1'];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 1 });
    expect(state.audits.map(reason)).toEqual(['status_update_failed', 'out_of_stock']);
  });

  it('I5: a slot-select DB error is captured into the no_available_slot audit reason', async () => {
    state.selectError = { message: 'db down' };
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 1 });
    expect(reason(state.audits[0])).toBe('no_available_slot: db down');
  });

  it('I5: a claim-update DB error is captured into the slot_claim_race audit reason', async () => {
    state.claimError = { message: 'conflict' };
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 1 });
    expect(reason(state.audits[0])).toBe('slot_claim_race: conflict');
  });

  it('does not throw when the audit_log insert itself fails (logged, not fatal)', async () => {
    state.reserveFailsFor = [501];
    state.auditShouldFail = true;
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
  });

  it('C1: logs (not silently drops) when the fallback communications insert fails, e.g. a missing comm_type enum value', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.reserveFailsFor = [501];
    state.commsInsertShouldFail = true;
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
    expect(errSpy).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('sends the pair_fallback email exactly once when there are fallbacks', async () => {
    state.reserveFailsFor = [501];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('never attempts sendEmail when every pair redeems', async () => {
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not send a second pair_fallback email when a non-failed one already exists for this membership', async () => {
    state.reserveFailsFor = [501];
    state.priorFallbackComms = [{ metadata: { membership_id: 'm1' }, status: 'sent' }];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('N1: a rejecting release RPC results in exactly one release attempt and does not throw out of the function', async () => {
    state.releaseRejects = true;
    createRedemptionFulfillmentOrder.mockRejectedValueOnce(new Error('boom'));
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 1 });
    expect(state.releaseCalls).toHaveLength(1);
    expect(reason(state.audits[0])).toContain('boom');
  });

  it('N1: a rejecting release RPC on the rx_routing_mismatch guard also results in exactly one release attempt', async () => {
    state.releaseRejects = true;
    createRedemptionFulfillmentOrder.mockResolvedValueOnce({ orderId: 'ro-mismatch', lineItemId: 'rl-mismatch', hasRxItems: false });
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 1 });
    expect(state.releaseCalls).toHaveLength(1);
  });

  it('N2: a product_metadata query failure fails the pair with frame_metadata_unavailable, not a misleading frame_not_rx_capable', async () => {
    state.metadataErrorFor = [501];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 1 });
    expect(reason(state.audits[0])).toBe('frame_metadata_unavailable: metadata query timed out');
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
    // the slot was never touched — no claim, no revert
    expect(state.slotUpdates).toHaveLength(0);
  });
});
