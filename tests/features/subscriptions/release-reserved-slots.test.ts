import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();

interface Opts {
  pending?: Array<{ id: string; frame_variant_id: number | null }>;
  pool?: Record<string, unknown> | null;
  poolUpdate?: ReturnType<typeof vi.fn>;
  adjustInsert?: ReturnType<typeof vi.fn>;
}

function install(o: Opts = {}) {
  const pending =
    'pending' in o ? o.pending! : [{ id: 'slot-1', frame_variant_id: 222 }];
  const pool = 'pool' in o ? o.pool : { id: 'pool-1', pool_quantity: 4 };

  const poolUpdate = o.poolUpdate ?? vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  const adjustInsert = o.adjustInsert ?? vi.fn(() => Promise.resolve({ error: null }));

  from.mockImplementation((t: string) => {
    if (t === 'subscription_redemptions') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              not: () => Promise.resolve({ data: pending, error: null }),
            }),
          }),
        }),
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
  return { poolUpdate, adjustInsert };
}

beforeEach(() => from.mockReset());

describe('releaseReservedSlots', () => {
  it('releases exactly one unit per pending_payment slot with a frame_variant_id', async () => {
    const spies = install({ pending: [{ id: 'slot-1', frame_variant_id: 222 }] });
    const { releaseReservedSlots } = await import(
      '@/features/subscriptions/lib/release-reserved-slots'
    );
    const res = await releaseReservedSlots({ from } as never, 'mem-1');

    expect(res.released).toBe(1);
    expect(spies.adjustInsert).toHaveBeenCalledTimes(1);
    expect(spies.adjustInsert).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 1, reason: 'subscription_release', user_id: null }),
    );
    // pool incremented by +1 (4 -> 5)
    expect(spies.poolUpdate).toHaveBeenCalledWith(expect.objectContaining({ pool_quantity: 5 }));
  });

  it('releases nothing when there are no reserved pending_payment slots', async () => {
    // The query only returns pending_payment slots with a non-null frame_variant_id,
    // so available/locked slots (no reservation) yield an empty set.
    const spies = install({ pending: [] });
    const { releaseReservedSlots } = await import(
      '@/features/subscriptions/lib/release-reserved-slots'
    );
    const res = await releaseReservedSlots({ from } as never, 'mem-1');

    expect(res.released).toBe(0);
    expect(spies.adjustInsert).not.toHaveBeenCalled();
    expect(spies.poolUpdate).not.toHaveBeenCalled();
  });

  it('releases one unit each for multiple reserved slots', async () => {
    const spies = install({
      pending: [
        { id: 'slot-1', frame_variant_id: 222 },
        { id: 'slot-2', frame_variant_id: 223 },
      ],
    });
    const { releaseReservedSlots } = await import(
      '@/features/subscriptions/lib/release-reserved-slots'
    );
    const res = await releaseReservedSlots({ from } as never, 'mem-1');

    expect(res.released).toBe(2);
    expect(spies.adjustInsert).toHaveBeenCalledTimes(2);
  });
});
