import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

vi.mock('@/features/rx-intake/lib/rx-token', () => ({
  generateRxToken: vi.fn(() => ({ token: 't', exp: 1 })),
}));

type LineRow = Record<string, unknown>;

function buildClient() {
  const orderInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'order-1' }, error: null }) }) }));
  const lineUpsert = vi.fn(() => Promise.resolve({ error: null }));

  const from = (table: string) => {
    switch (table) {
      case 'customers':
        return {
          upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'cust-1' }, error: null }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'cust-1' }, error: null }) }) }),
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        };
      case 'orders':
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          insert: orderInsert,
          update: vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) })),
        };
      case 'order_line_items':
        return { upsert: lineUpsert };
      case 'communications':
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        };
      default:
        return {};
    }
  };
  return { client: { from } as unknown as SupabaseClient<Database>, orderInsert, lineUpsert };
}

function upsertedLines(lineUpsert: ReturnType<typeof vi.fn>): LineRow[] {
  return (lineUpsert.mock.calls[0] as unknown[])[0] as LineRow[];
}

beforeEach(() => vi.clearAllMocks());

describe('syncShopifyOrder — lens add-on pairing (spec 2026-07-29)', () => {
  it('persists line_ref + lens selection on the frame line', async () => {
    const { client, lineUpsert } = buildClient();
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder({
      id: 8001, name: 'GV-8001',
      line_items: [{
        id: 11, title: 'Frame', quantity: 1, price: '129.00', sku: 'GV-AVIATOR',
        properties: [
          { name: 'line_ref', value: 'ref-abc' },
          { name: 'lens_type', value: 'progressive' },
          { name: 'coatings', value: 'ar,blue_light' },
          { name: 'tint', value: 'grey' },
          { name: 'is_rx_required', value: 'true' },
        ],
      }],
    }, client);

    expect(result.success).toBe(true);
    const [frame] = upsertedLines(lineUpsert);
    expect(frame).toMatchObject({
      line_ref: 'ref-abc',
      lens_type: 'progressive',
      coatings: 'ar,blue_light',
      tint: 'grey',
      is_rx_required: true,
      addon_for_ref: null,
    });
  });

  it('marks _addon_for lines as add-ons and forces is_rx_required=false', async () => {
    const { client, orderInsert, lineUpsert } = buildClient();
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder({
      id: 8002, name: 'GV-8002',
      line_items: [
        {
          id: 21, title: 'Frame', quantity: 1, price: '129.00',
          properties: [{ name: 'line_ref', value: 'ref-1' }, { name: 'is_rx_required', value: 'false' }],
        },
        {
          id: 22, title: 'Progressive Rx lenses', quantity: 1, price: '150.00', sku: 'LENSUP-PROGRESSIVE',
          // A stray truthy Rx flag on an add-on must NOT trigger the Rx pipeline.
          properties: [{ name: '_addon_for', value: 'ref-1' }, { name: 'is_rx_required', value: 'true' }],
        },
      ],
    }, client);

    expect(result.success).toBe(true);
    const [, addon] = upsertedLines(lineUpsert);
    expect(addon).toMatchObject({ addon_for_ref: 'ref-1', is_rx_required: false });
    // Add-on lines never flip the order into the Rx pipeline.
    const inserted = (orderInsert.mock.calls[0] as unknown[])[0] as { has_rx_items: boolean; rx_status: string };
    expect(inserted.has_rx_items).toBe(false);
    expect(inserted.rx_status).toBe('none');
  });

  it('detects add-ons by LENSUP- SKU prefix when properties are missing (manual Shopify order)', async () => {
    const { client, lineUpsert } = buildClient();
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder({
      id: 8003, name: 'GV-8003',
      line_items: [{ id: 31, title: 'AR coating', quantity: 1, price: '30.00', sku: 'LENSUP-AR' }],
    }, client);

    expect(result.success).toBe(true);
    const [addon] = upsertedLines(lineUpsert);
    expect(addon).toMatchObject({ addon_for_ref: 'sku', is_rx_required: false });
  });
});
