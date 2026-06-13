import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdminFetch = vi.fn();
vi.mock('@/lib/commerce/admin-fetch', () => ({
  adminFetch: mockAdminFetch,
  ADMIN_API_VERSION: '2025-01',
}));
vi.mock('@/lib/commerce/fetch-with-retry', () => ({ fetchWithRetry: vi.fn() }));

beforeEach(() => mockAdminFetch.mockReset());

describe('createFulfillment (fulfillment-orders flow)', () => {
  it('resolves fulfillment orders then posts fulfillments.json scoped to the line item', async () => {
    // 1st call: GET fulfillment_orders. 2nd call: POST fulfillments.json.
    mockAdminFetch
      .mockResolvedValueOnce({
        fulfillment_orders: [
          {
            id: 99,
            status: 'open',
            line_items: [
              { id: 11, line_item_id: 111, quantity: 1 },
              { id: 12, line_item_id: 222, quantity: 1 },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ fulfillment: { id: 1 } });

    const { createFulfillment } = await import('@/lib/commerce/shopify-admin');
    await createFulfillment(555, 'TRK', 'DHL', [111]);

    expect(mockAdminFetch).toHaveBeenNthCalledWith(1, 'orders/555/fulfillment_orders.json');
    // Never touches the legacy (removed) order-scoped endpoint.
    expect(mockAdminFetch).not.toHaveBeenCalledWith('orders/555/fulfillments.json', expect.anything());

    const [endpoint, opts] = mockAdminFetch.mock.calls[1] as [string, { body: { fulfillment: Record<string, unknown> } }];
    expect(endpoint).toBe('fulfillments.json');
    const body = opts.body.fulfillment;
    expect(body.tracking_info).toEqual({ number: 'TRK', company: 'DHL' });
    expect(body.notify_customer).toBe(true);
    // Only the matching FO line item (id 11 for order line 111), not 12.
    expect(body.line_items_by_fulfillment_order).toEqual([
      { fulfillment_order_id: 99, fulfillment_order_line_items: [{ id: 11, quantity: 1 }] },
    ]);
  });

  it('throws when the order has no fulfillable line items', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      fulfillment_orders: [{ id: 99, status: 'closed', line_items: [] }],
    });

    const { createFulfillment } = await import('@/lib/commerce/shopify-admin');
    await expect(createFulfillment(555, 'TRK', 'DHL', [111])).rejects.toThrow(/no fulfillable/i);
  });
});
