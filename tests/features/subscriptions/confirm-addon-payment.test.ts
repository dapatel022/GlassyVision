import { describe, it, expect, vi, beforeEach } from 'vitest';

const createRedemptionFulfillmentOrder = vi.fn();
vi.mock('@/features/subscriptions/redemption-order', () => ({
  createRedemptionFulfillmentOrder: (...args: unknown[]) =>
    createRedemptionFulfillmentOrder(...args),
}));

const from = vi.fn();

interface Opts {
  redemption?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  redemptionUpdate?: ReturnType<typeof vi.fn>;
}

function install(o: Opts = {}) {
  const redemption =
    'redemption' in o
      ? o.redemption
      : {
          id: 'slot-1',
          status: 'pending_payment',
          membership_id: 'mem-1',
          expected_surcharge: 40,
          frame_variant_id: 222,
          lens_config: { lens_type: 'single_vision' },
          ship_to: { country_code: 'US' },
        };
  const membership =
    'membership' in o ? o.membership : { customer_id: 'cust-1', currency: 'usd' };
  const redemptionUpdate =
    o.redemptionUpdate ?? vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));

  from.mockImplementation((t: string) => {
    if (t === 'subscription_redemptions') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: redemption, error: null }) }) }),
        update: redemptionUpdate,
      };
    }
    if (t === 'subscription_memberships') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: membership, error: null }) }) }) };
    }
    return {};
  });
  return { redemptionUpdate };
}

beforeEach(() => {
  from.mockReset();
  createRedemptionFulfillmentOrder.mockReset();
  createRedemptionFulfillmentOrder.mockResolvedValue({ orderId: 'ord-1', lineItemId: 'li-1' });
});

describe('confirmAddonPayment', () => {
  it('advances when paid amount >= expected_surcharge', async () => {
    const { redemptionUpdate } = install();
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment('slot-1', 40, 7777, { from } as never);
    expect(res.advanced).toBe(true);
    expect(createRedemptionFulfillmentOrder).toHaveBeenCalled();
    expect(redemptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'awaiting_rx',
        internal_order_id: 'ord-1',
        add_on_shopify_order_id: 7777,
      }),
    );
  });

  it('does NOT advance when paid amount < expected_surcharge', async () => {
    const { redemptionUpdate } = install();
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment('slot-1', 1, 7777, { from } as never);
    expect(res.advanced).toBe(false);
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
    expect(redemptionUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown redemption id', async () => {
    install({ redemption: null });
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment('nope', 999, 7777, { from } as never);
    expect(res.advanced).toBe(false);
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('is a no-op when the redemption is not pending_payment', async () => {
    install({ redemption: { id: 'slot-1', status: 'awaiting_rx', membership_id: 'mem-1', expected_surcharge: 40 } });
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment('slot-1', 999, 7777, { from } as never);
    expect(res.advanced).toBe(false);
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });
});
