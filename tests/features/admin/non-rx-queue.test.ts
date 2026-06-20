import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
function makeClient() { return { from: mockFrom }; }

beforeEach(() => mockFrom.mockReset());

describe('getNonRxQueueItems', () => {
  it('returns paid non-Rx line items that have no work order yet', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'order_line_items') return {
        select: () => ({ eq: () => Promise.resolve({ data: [
          { id: 'li-1', order_id: 'o-1', sku: 'GV-SUN', product_title: 'Sun', is_rx_required: false,
            orders: { shopify_order_number: '1001', financial_status: 'paid', fulfillment_status: 'unfulfilled', shipping_address: { country_code: 'US' } } },
          { id: 'li-2', order_id: 'o-2', sku: 'GV-SUN2', product_title: 'Sun2', is_rx_required: false,
            orders: { shopify_order_number: '1002', financial_status: 'paid', fulfillment_status: 'unfulfilled', shipping_address: { country_code: 'CA' } } },
          // unpaid → excluded
          { id: 'li-3', order_id: 'o-3', sku: 'GV-SUN3', product_title: 'Sun3', is_rx_required: false,
            orders: { shopify_order_number: '1003', financial_status: 'pending', fulfillment_status: 'unfulfilled', shipping_address: { country_code: 'US' } } },
          // already shipped → excluded
          { id: 'li-4', order_id: 'o-4', sku: 'GV-SUN4', product_title: 'Sun4', is_rx_required: false,
            orders: { shopify_order_number: '1004', financial_status: 'paid', fulfillment_status: 'shipped', shipping_address: { country_code: 'US' } } },
        ], error: null }) }),
      };
      // li-2 already has a non-Rx work order → must be excluded.
      if (table === 'work_orders') return {
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [{ line_item_id: 'li-2' }], error: null }) }) }),
      };
      return {};
    });

    const { getNonRxQueueItems } = await import('@/features/admin/lib/non-rx-queue');
    const items = await getNonRxQueueItems(makeClient() as never);
    expect(items.map((i) => i.lineItemId)).toEqual(['li-1']);
    expect(items[0]).toMatchObject({ orderId: 'o-1', orderNumber: '1001', country: 'US' });
  });

  it('returns an empty list when no non-Rx line items are waiting', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      if (table === 'work_orders') return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
      return {};
    });
    const { getNonRxQueueItems } = await import('@/features/admin/lib/non-rx-queue');
    const items = await getNonRxQueueItems(makeClient() as never);
    expect(items).toEqual([]);
  });
});
