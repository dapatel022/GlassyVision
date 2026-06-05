import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCustomerOrders } from '@/features/account/orders/get-customer-orders';

// Records the filter chain so we can assert customer scoping + the
// non-subscription filter, and returns the supplied rows.
function makeSupabase(rows: unknown[]) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {
    select: (...a: unknown[]) => {
      calls.push(['select', a]);
      return chain;
    },
    eq: (...a: unknown[]) => {
      calls.push(['eq', a]);
      return chain;
    },
    neq: (...a: unknown[]) => {
      calls.push(['neq', a]);
      return chain;
    },
    order: (...a: unknown[]) => {
      calls.push(['order', a]);
      return Promise.resolve({ data: rows, error: null });
    },
  };
  const from = vi.fn(() => chain);
  return { client: { from } as never, from, calls };
}

const ROW = {
  id: 'ord-1',
  shopify_order_number: '1001',
  created_at: '2026-06-01T00:00:00Z',
  financial_status: 'paid',
  fulfillment_status: 'shipped',
  total: 120,
  currency: 'usd',
  order_line_items: [
    { id: 'li-1', product_title: 'Frame A', variant_title: 'Black', quantity: 1 },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('getCustomerOrders', () => {
  it('scopes to the customer and excludes subscription orders', async () => {
    const { client, from, calls } = makeSupabase([ROW]);
    const orders = await getCustomerOrders('cust-1', client);

    expect(from).toHaveBeenCalledWith('orders');
    // customer scoping
    const eqCustomer = calls.find((c) => c[0] === 'eq' && c[1][0] === 'customer_id');
    expect(eqCustomer![1][1]).toBe('cust-1');
    // non-subscription filter
    const neqSource = calls.find((c) => c[0] === 'neq' && c[1][0] === 'order_source');
    expect(neqSource![1][1]).toBe('subscription');

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      id: 'ord-1',
      orderNumber: '1001',
      financialStatus: 'paid',
      fulfillmentStatus: 'shipped',
    });
    expect(orders[0].lineItems).toHaveLength(1);
    expect(orders[0].lineItems[0].title).toBe('Frame A');
  });

  it('returns an empty list when the customer has no one-time orders', async () => {
    const { client } = makeSupabase([]);
    const orders = await getCustomerOrders('cust-2', client);
    expect(orders).toEqual([]);
  });

  it('never queries without a customer scope (no leakage)', async () => {
    const { client, calls } = makeSupabase([ROW]);
    await getCustomerOrders('cust-1', client);
    // There must always be a customer_id eq filter on the orders query.
    expect(calls.some((c) => c[0] === 'eq' && c[1][0] === 'customer_id')).toBe(true);
  });
});
