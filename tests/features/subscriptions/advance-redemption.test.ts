import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();

function installUpdate(updatedRows: Array<{ id: string }>) {
  const update = vi.fn(() => ({
    eq: () => ({ select: () => Promise.resolve({ data: updatedRows, error: null }) }),
  }));
  from.mockImplementation((t: string) => {
    if (t === 'subscription_redemptions') return { update };
    return {};
  });
  return update;
}

beforeEach(() => from.mockReset());

describe('advanceRedemptionForOrder', () => {
  it('updates the redemption linked to the internal order', async () => {
    const update = installUpdate([{ id: 'slot-1' }]);
    const { advanceRedemptionForOrder } = await import('@/features/subscriptions/advance-redemption');
    const res = await advanceRedemptionForOrder('ord-1', 'in_production', { from } as never, {
      workOrderId: 'wo-1',
    });
    expect(res.advanced).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_production', work_order_id: 'wo-1' }),
    );
  });

  it('is a no-op for a normal (non-subscription) order — nothing linked', async () => {
    const update = installUpdate([]); // no rows match internal_order_id
    const { advanceRedemptionForOrder } = await import('@/features/subscriptions/advance-redemption');
    const res = await advanceRedemptionForOrder('normal-order', 'in_production', { from } as never);
    expect(res.advanced).toBe(false);
    // it still scopes the update to internal_order_id (safe), but matches no rows
    expect(update).toHaveBeenCalled();
  });

  it('sets retention_anchor when advancing to shipped', async () => {
    const update = installUpdate([{ id: 'slot-1' }]);
    const { advanceRedemptionForOrder } = await import('@/features/subscriptions/advance-redemption');
    await advanceRedemptionForOrder('ord-1', 'shipped', { from } as never, {
      retentionAnchor: '2026-05-31',
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'shipped', retention_anchor: '2026-05-31' }),
    );
  });
});
