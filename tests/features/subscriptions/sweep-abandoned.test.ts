import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const rpc = vi.fn(() => Promise.resolve({ data: 'pool-1', error: null }));

interface Opts {
  stale?: Array<Record<string, unknown>>;
  /** Whether the conditional reset (eq status=pending_payment) matches a row. */
  resetMatches?: boolean;
}

function install(o: Opts = {}) {
  const stale = 'stale' in o ? o.stale! : [{ id: 'slot-1', frame_variant_id: 222 }];
  const resetMatches = o.resetMatches ?? true;

  // .update().eq('id').eq('status','pending_payment').select('id')
  const redemptionUpdate = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        select: () => Promise.resolve({ data: resetMatches ? [{ id: 'slot-1' }] : [], error: null }),
      }),
    }),
  }));

  from.mockImplementation((t: string) => {
    if (t === 'subscription_redemptions') {
      return {
        select: () => ({ eq: () => ({ lt: () => Promise.resolve({ data: stale, error: null }) }) }),
        update: redemptionUpdate,
      };
    }
    return {};
  });
  return { redemptionUpdate };
}

beforeEach(() => {
  from.mockReset();
  rpc.mockClear();
});

describe('sweepAbandonedRedemptions', () => {
  it('resets a stale pending_payment slot to available + releases the reservation atomically', async () => {
    const spies = install();
    const { sweepAbandonedRedemptions } = await import('@/features/subscriptions/sweep-abandoned');
    const res = await sweepAbandonedRedemptions({ from, rpc } as never);
    expect(res.released).toBe(1);
    expect(spies.redemptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'available', frame_variant_id: null, expected_surcharge: 0 }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'release_inventory_unit',
      expect.objectContaining({ p_variant_id: 222, p_reason: 'subscription_release' }),
    );
  });

  it('returns 0 when there is nothing stale', async () => {
    install({ stale: [] });
    const { sweepAbandonedRedemptions } = await import('@/features/subscriptions/sweep-abandoned');
    const res = await sweepAbandonedRedemptions({ from, rpc } as never);
    expect(res.released).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still resets the slot when no frame_variant_id is set (nothing to release)', async () => {
    install({ stale: [{ id: 'slot-x', frame_variant_id: null }] });
    const { sweepAbandonedRedemptions } = await import('@/features/subscriptions/sweep-abandoned');
    const res = await sweepAbandonedRedemptions({ from, rpc } as never);
    expect(res.released).toBe(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does NOT release when a concurrent confirm already advanced the slot (race guard)', async () => {
    install({ resetMatches: false });
    const { sweepAbandonedRedemptions } = await import('@/features/subscriptions/sweep-abandoned');
    const res = await sweepAbandonedRedemptions({ from, rpc } as never);
    expect(res.released).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
