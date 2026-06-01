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
          // Two required surcharge variants: the premium-frame surcharge (9001)
          // and the selected add-on (8001).
          lens_config: { lens_type: 'single_vision', addon_variant_ids: [9001, 8001] },
          ship_to: { country_code: 'US' },
        };
  const membership =
    'membership' in o ? o.membership : { customer_id: 'cust-1', currency: 'usd', customers: { email: 'a@b.com' } };
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

// A paid add-on order that contains BOTH required surcharge variants at qty 1.
const fullLineItems = [
  { variant_id: 9001, quantity: 1 },
  { variant_id: 8001, quantity: 1 },
];

beforeEach(() => {
  from.mockReset();
  createRedemptionFulfillmentOrder.mockReset();
  createRedemptionFulfillmentOrder.mockResolvedValue({ orderId: 'ord-1', lineItemId: 'li-1' });
});

describe('confirmAddonPayment', () => {
  it('advances when subtotal >= expected AND all required variants are present', async () => {
    const { redemptionUpdate } = install();
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment(
      'slot-1',
      { paidSubtotal: 40, lineItems: fullLineItems },
      7777,
      { from } as never,
    );
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

  it('passes the membership currency + customers-joined email into the fulfillment order', async () => {
    install({ membership: { customer_id: 'cust-1', currency: 'cad', customers: { email: 'joined@example.com' } } });
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    await confirmAddonPayment('slot-1', { paidSubtotal: 40, lineItems: fullLineItems }, 7777, { from } as never);
    expect(createRedemptionFulfillmentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        membership: expect.objectContaining({
          customer_id: 'cust-1',
          customer_email: 'joined@example.com',
          currency: 'cad',
        }),
      }),
      expect.anything(),
    );
  });

  it('does NOT advance on a $0 subtotal when required variants exist, even if expected_surcharge is mis-set to 0', async () => {
    const { redemptionUpdate } = install({
      redemption: {
        id: 'slot-1',
        status: 'pending_payment',
        membership_id: 'mem-1',
        expected_surcharge: 0, // mis-recorded
        frame_variant_id: 222,
        lens_config: { addon_variant_ids: [9001, 8001] },
        ship_to: { country_code: 'US' },
      },
    });
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment(
      'slot-1',
      { paidSubtotal: 0, lineItems: fullLineItems },
      7777,
      { from } as never,
    );
    expect(res.advanced).toBe(false);
    expect(res.reason).toBe('amount_too_low');
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
    expect(redemptionUpdate).not.toHaveBeenCalled();
  });

  it('does NOT advance when a required variant is missing (even if subtotal >= expected)', async () => {
    const { redemptionUpdate } = install();
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    // Only the cheap add-on (8001) is present; the premium surcharge (9001) is missing,
    // yet the buyer "paid" a subtotal that meets the threshold via the cheap item.
    const res = await confirmAddonPayment(
      'slot-1',
      { paidSubtotal: 100, lineItems: [{ variant_id: 8001, quantity: 1 }] },
      7777,
      { from } as never,
    );
    expect(res.advanced).toBe(false);
    expect(res.reason).toBe('missing_required_variant');
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
    expect(redemptionUpdate).not.toHaveBeenCalled();
  });

  it('does NOT advance when a required variant has quantity 0 / absent quantity', async () => {
    install();
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment(
      'slot-1',
      { paidSubtotal: 100, lineItems: [{ variant_id: 9001, quantity: 1 }, { variant_id: 8001, quantity: 0 }] },
      7777,
      { from } as never,
    );
    expect(res.advanced).toBe(false);
    expect(res.reason).toBe('missing_required_variant');
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('does NOT advance when product subtotal < expected_surcharge', async () => {
    const { redemptionUpdate } = install();
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment(
      'slot-1',
      { paidSubtotal: 1, lineItems: fullLineItems },
      7777,
      { from } as never,
    );
    expect(res.advanced).toBe(false);
    expect(res.reason).toBe('amount_too_low');
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
    expect(redemptionUpdate).not.toHaveBeenCalled();
  });

  it('does NOT advance when shipping/tax inflate the gross total but product subtotal < expected', async () => {
    const { redemptionUpdate } = install();
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    // Gross total (e.g. 45 with 30 shipping + tax) would have passed the old check,
    // but the product subtotal (15) is below the 40 expected surcharge.
    const res = await confirmAddonPayment(
      'slot-1',
      { paidSubtotal: 15, lineItems: fullLineItems },
      7777,
      { from } as never,
    );
    expect(res.advanced).toBe(false);
    expect(res.reason).toBe('amount_too_low');
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
    expect(redemptionUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown redemption id', async () => {
    install({ redemption: null });
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment('nope', { paidSubtotal: 999, lineItems: fullLineItems }, 7777, { from } as never);
    expect(res.advanced).toBe(false);
    expect(res.reason).toBe('unknown_redemption');
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('is a no-op when the redemption is not pending_payment', async () => {
    install({
      redemption: {
        id: 'slot-1',
        status: 'awaiting_rx',
        membership_id: 'mem-1',
        expected_surcharge: 40,
        lens_config: { addon_variant_ids: [9001, 8001] },
      },
    });
    const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
    const res = await confirmAddonPayment('slot-1', { paidSubtotal: 999, lineItems: fullLineItems }, 7777, { from } as never);
    expect(res.advanced).toBe(false);
    expect(res.reason).toBe('not_pending_payment');
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });
});
