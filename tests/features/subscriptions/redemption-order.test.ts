import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
beforeEach(() => from.mockReset());

describe('createRedemptionFulfillmentOrder', () => {
  it('creates a subscription-source order + line item with frame spec', async () => {
    const orderInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'ord-1' }, error: null }) }) }));
    const liInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'li-1' }, error: null }) }) }));
    from.mockImplementation((t: string) => {
      if (t === 'product_metadata') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { sku: 'GV-1', frame_shape: 'round', is_rx_capable: true }, error: null }) }) }) };
      if (t === 'orders') return { insert: orderInsert };
      if (t === 'order_line_items') return { insert: liInsert };
      return {};
    });
    const { createRedemptionFulfillmentOrder } = await import('@/features/subscriptions/redemption-order');
    const res = await createRedemptionFulfillmentOrder({
      id: 'r1', frame_variant_id: 222, lens_config: {}, ship_to: { country_code: 'US' },
      membership: { customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd' },
    } as never, { from } as never);
    expect(res).toEqual({ orderId: 'ord-1', lineItemId: 'li-1', hasRxItems: true });
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({ order_source: 'subscription', shopify_order_id: null, billing_country: 'us' }));
    expect(liInsert).toHaveBeenCalledWith(expect.objectContaining({ order_id: 'ord-1', shopify_line_item_id: null, sku: 'GV-1' }));
  });

  it('marks an Rx-capable frame as awaiting_rx with an Rx-required line item', async () => {
    const orderInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'ord-2' }, error: null }) }) }));
    const liInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'li-2' }, error: null }) }) }));
    from.mockImplementation((t: string) => {
      if (t === 'product_metadata') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { sku: 'GV-RX', frame_shape: 'square', is_rx_capable: true }, error: null }) }) }) };
      if (t === 'orders') return { insert: orderInsert };
      if (t === 'order_line_items') return { insert: liInsert };
      return {};
    });
    const { createRedemptionFulfillmentOrder } = await import('@/features/subscriptions/redemption-order');
    await createRedemptionFulfillmentOrder({
      id: 'r2', frame_variant_id: 333, lens_config: { lens_type: 'single_vision' }, ship_to: { country_code: 'CA' },
      membership: { customer_id: 'c1', customer_email: 'a@b.com', currency: 'cad' },
    } as never, { from } as never);
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({
      has_rx_items: true, rx_status: 'awaiting_upload', billing_country: 'ca', currency: 'cad',
    }));
    expect(liInsert).toHaveBeenCalledWith(expect.objectContaining({ is_rx_required: true }));
  });

  it('marks a non-Rx-capable frame as none / not Rx-required', async () => {
    const orderInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'ord-3' }, error: null }) }) }));
    const liInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'li-3' }, error: null }) }) }));
    from.mockImplementation((t: string) => {
      if (t === 'product_metadata') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { sku: 'GV-SUN', frame_shape: 'aviator', is_rx_capable: false }, error: null }) }) }) };
      if (t === 'orders') return { insert: orderInsert };
      if (t === 'order_line_items') return { insert: liInsert };
      return {};
    });
    const { createRedemptionFulfillmentOrder } = await import('@/features/subscriptions/redemption-order');
    await createRedemptionFulfillmentOrder({
      id: 'r3', frame_variant_id: 444, lens_config: {}, ship_to: { country_code: 'us' },
      membership: { customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd' },
    } as never, { from } as never);
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({ has_rx_items: false, rx_status: 'none' }));
    expect(liInsert).toHaveBeenCalledWith(expect.objectContaining({ is_rx_required: false }));
  });

  it('returns hasRxItems=false for a non-Rx-capable frame', async () => {
    const orderInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'ord-n' }, error: null }) }) }));
    const liInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'li-n' }, error: null }) }) }));
    from.mockImplementation((t: string) => {
      if (t === 'product_metadata') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { sku: 'GV-SUN', frame_shape: 'aviator', is_rx_capable: false }, error: null }) }) }) };
      if (t === 'orders') return { insert: orderInsert };
      if (t === 'order_line_items') return { insert: liInsert };
      return {};
    });
    const { createRedemptionFulfillmentOrder } = await import('@/features/subscriptions/redemption-order');
    const res = await createRedemptionFulfillmentOrder({
      id: 'rn', frame_variant_id: 555, lens_config: {}, ship_to: { country_code: 'US' },
      membership: { customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd' },
    } as never, { from } as never);
    expect(res).toEqual({ orderId: 'ord-n', lineItemId: 'li-n', hasRxItems: false });
  });

  it('returns hasRxItems=true for an Rx-capable frame with an Rx lens', async () => {
    const orderInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'ord-r' }, error: null }) }) }));
    const liInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'li-r' }, error: null }) }) }));
    from.mockImplementation((t: string) => {
      if (t === 'product_metadata') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { sku: 'GV-RX', frame_shape: 'square', is_rx_capable: true }, error: null }) }) }) };
      if (t === 'orders') return { insert: orderInsert };
      if (t === 'order_line_items') return { insert: liInsert };
      return {};
    });
    const { createRedemptionFulfillmentOrder } = await import('@/features/subscriptions/redemption-order');
    const res = await createRedemptionFulfillmentOrder({
      id: 'rr', frame_variant_id: 666, lens_config: { lens_type: 'single_vision' }, ship_to: { country_code: 'US' },
      membership: { customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd' },
    } as never, { from } as never);
    expect(res).toEqual({ orderId: 'ord-r', lineItemId: 'li-r', hasRxItems: true });
  });

  it('throws when the order insert fails', async () => {
    const orderInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }));
    from.mockImplementation((t: string) => {
      if (t === 'product_metadata') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { sku: 'GV-1', frame_shape: 'round', is_rx_capable: true }, error: null }) }) }) };
      if (t === 'orders') return { insert: orderInsert };
      return {};
    });
    const { createRedemptionFulfillmentOrder } = await import('@/features/subscriptions/redemption-order');
    await expect(createRedemptionFulfillmentOrder({
      id: 'r4', frame_variant_id: 222, lens_config: {}, ship_to: { country_code: 'US' },
      membership: { customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd' },
    } as never, { from } as never)).rejects.toThrow();
  });
});
