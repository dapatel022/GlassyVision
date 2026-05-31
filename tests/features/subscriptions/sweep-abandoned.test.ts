import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();

interface Opts {
  stale?: Array<Record<string, unknown>>;
  pool?: Record<string, unknown> | null;
  redemptionUpdate?: ReturnType<typeof vi.fn>;
  poolUpdate?: ReturnType<typeof vi.fn>;
  adjustInsert?: ReturnType<typeof vi.fn>;
}

function install(o: Opts = {}) {
  const stale =
    'stale' in o
      ? o.stale!
      : [{ id: 'slot-1', frame_variant_id: 222 }];
  const pool = 'pool' in o ? o.pool : { id: 'pool-1', pool_quantity: 4 };

  const redemptionUpdate =
    o.redemptionUpdate ?? vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  const poolUpdate = o.poolUpdate ?? vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  const adjustInsert = o.adjustInsert ?? vi.fn(() => Promise.resolve({ error: null }));

  from.mockImplementation((t: string) => {
    if (t === 'subscription_redemptions') {
      return {
        select: () => ({
          eq: () => ({ lt: () => Promise.resolve({ data: stale, error: null }) }),
        }),
        update: redemptionUpdate,
      };
    }
    if (t === 'inventory_pool') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: pool, error: null }) }) }),
        update: poolUpdate,
      };
    }
    if (t === 'inventory_adjustments') {
      return { insert: adjustInsert };
    }
    return {};
  });
  return { redemptionUpdate, poolUpdate, adjustInsert };
}

beforeEach(() => from.mockReset());

describe('sweepAbandonedRedemptions', () => {
  it('resets a stale pending_payment slot to available + releases the reservation', async () => {
    const spies = install();
    const { sweepAbandonedRedemptions } = await import('@/features/subscriptions/sweep-abandoned');
    const res = await sweepAbandonedRedemptions({ from } as never);
    expect(res.released).toBe(1);
    // slot reset
    expect(spies.redemptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'available', frame_variant_id: null, expected_surcharge: 0 }),
    );
    // reservation released (+1)
    expect(spies.adjustInsert).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 1, reason: 'subscription_release', user_id: null }),
    );
    expect(spies.poolUpdate).toHaveBeenCalled();
  });

  it('returns 0 when there is nothing stale', async () => {
    install({ stale: [] });
    const { sweepAbandonedRedemptions } = await import('@/features/subscriptions/sweep-abandoned');
    const res = await sweepAbandonedRedemptions({ from } as never);
    expect(res.released).toBe(0);
  });

  it('still resets the slot when no frame_variant_id is set (nothing to release)', async () => {
    const spies = install({ stale: [{ id: 'slot-x', frame_variant_id: null }] });
    const { sweepAbandonedRedemptions } = await import('@/features/subscriptions/sweep-abandoned');
    const res = await sweepAbandonedRedemptions({ from } as never);
    expect(res.released).toBe(1);
    expect(spies.redemptionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'available' }));
    expect(spies.adjustInsert).not.toHaveBeenCalled();
  });
});
