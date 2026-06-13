import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const rpc = vi.fn(() => Promise.resolve({ data: 'pool-1', error: null }));

interface Opts {
  pending?: Array<{ id: string; frame_variant_id: number | null }>;
}

function install(o: Opts = {}) {
  const pending = 'pending' in o ? o.pending! : [{ id: 'slot-1', frame_variant_id: 222 }];

  from.mockImplementation((t: string) => {
    if (t === 'subscription_redemptions') {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ not: () => Promise.resolve({ data: pending, error: null }) }) }),
        }),
      };
    }
    return {};
  });
}

beforeEach(() => {
  from.mockReset();
  rpc.mockClear();
});

describe('releaseReservedSlots', () => {
  it('releases exactly one unit per pending_payment slot with a frame_variant_id (atomic RPC)', async () => {
    install({ pending: [{ id: 'slot-1', frame_variant_id: 222 }] });
    const { releaseReservedSlots } = await import('@/features/subscriptions/lib/release-reserved-slots');
    const res = await releaseReservedSlots({ from, rpc } as never, 'mem-1');

    expect(res.released).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'release_inventory_unit',
      expect.objectContaining({ p_variant_id: 222, p_reason: 'subscription_release', p_redemption_id: 'slot-1' }),
    );
  });

  it('releases nothing when there are no reserved pending_payment slots', async () => {
    install({ pending: [] });
    const { releaseReservedSlots } = await import('@/features/subscriptions/lib/release-reserved-slots');
    const res = await releaseReservedSlots({ from, rpc } as never, 'mem-1');

    expect(res.released).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('releases one unit each for multiple reserved slots', async () => {
    install({
      pending: [
        { id: 'slot-1', frame_variant_id: 222 },
        { id: 'slot-2', frame_variant_id: 223 },
      ],
    });
    const { releaseReservedSlots } = await import('@/features/subscriptions/lib/release-reserved-slots');
    const res = await releaseReservedSlots({ from, rpc } as never, 'mem-1');

    expect(res.released).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
