import { describe, it, expect, vi } from 'vitest';
import { syncShopifyOrder } from '@/lib/commerce/sync';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// Builds a minimal fake Supabase client capturing the customers write path.
function buildFakeClient(customerUpsert: ReturnType<typeof vi.fn>, customerInsert: ReturnType<typeof vi.fn>) {
  const from = (table: string) => {
    switch (table) {
      case 'customers':
        return {
          upsert: customerUpsert,
          insert: customerInsert,
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        };
      case 'orders':
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'order-1' }, error: null }) }) }),
        };
      case 'order_line_items':
        return { delete: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      default:
        return {};
    }
  };
  return { from } as unknown as SupabaseClient<Database>;
}

describe('syncShopifyOrder — customer dedupe', () => {
  it('upserts the customer on shopify_customer_id (no check-then-insert race)', async () => {
    const customerUpsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'cust-1' }, error: null }) }) }));
    const customerInsert = vi.fn();
    const client = buildFakeClient(customerUpsert, customerInsert);

    const result = await syncShopifyOrder(
      { id: 5001, name: 'GV-5001', customer: { id: 99, email: 'a@b.com' }, line_items: [] },
      client,
    );

    expect(result.success).toBe(true);
    expect(customerUpsert).toHaveBeenCalledTimes(1);
    expect(customerInsert).not.toHaveBeenCalled();
    // upsert must target the unique shopify_customer_id
    expect((customerUpsert.mock.calls[0] as unknown[])[1]).toMatchObject({ onConflict: 'shopify_customer_id' });
  });
});
