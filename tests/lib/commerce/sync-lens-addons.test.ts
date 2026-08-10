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

describe('syncShopifyOrder — pair configs + SURCH- charge carriers (plan-builder Task 4)', () => {
  it('persists _pair_N properties as pair_configs on the membership line', async () => {
    const { client, lineUpsert } = buildClient();
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder({
      id: 9001, name: 'GV-9001',
      line_items: [{
        id: 111, product_id: 1, variant_id: 43038182735943, title: 'GlassyVision Membership — Trio',
        sku: 'SUB-3PAIR', price: '219.00', quantity: 1,
        properties: [
          { name: 'is_rx_required', value: 'false' },
          { name: '_pair_1', value: '{"v":43021235028039,"h":"dusk-wayfarer","l":"single_vision","u":[],"t":"none"}' },
          { name: '_pair_2', value: '{"v":43021235028040,"h":"marina-oval-sun","l":"non_rx","u":["photochromic"],"t":"grey"}' },
        ],
      }],
    }, client);

    expect(result.success).toBe(true);
    const [membershipLine] = upsertedLines(lineUpsert);
    expect(membershipLine.sku).toBe('SUB-3PAIR');
    expect(membershipLine.pair_configs).toHaveLength(2);
    expect((membershipLine.pair_configs as Array<Record<string, unknown>>)[0]).toMatchObject({ v: 43021235028039, l: 'single_vision' });
  });

  it('drops malformed pair properties without failing the sync (fail-safe)', async () => {
    const { client, lineUpsert } = buildClient();
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder({
      id: 9002, name: 'GV-9002',
      line_items: [{
        id: 112, product_id: 1, variant_id: 43038182735943, title: 'Membership', sku: 'SUB-2PAIR',
        price: '179.00', quantity: 1,
        properties: [{ name: '_pair_1', value: 'not-json' }],
      }],
    }, client);

    expect(result.success).toBe(true);
    const [membershipLine] = upsertedLines(lineUpsert);
    expect(membershipLine.pair_configs).toBeNull();
  });

  it('treats SURCH- lines as addon charge carriers (never Rx, no pair_configs)', async () => {
    const { client, lineUpsert } = buildClient();
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder({
      id: 9003, name: 'GV-9003',
      line_items: [{
        id: 113, product_id: 2, variant_id: 777, title: 'Premium frame surcharge', sku: 'SURCH-PREMIUM',
        price: '40.00', quantity: 1, properties: [],
      }],
    }, client);

    expect(result.success).toBe(true);
    const [line] = upsertedLines(lineUpsert);
    expect(line.addon_for_ref).not.toBeNull();
    expect(line.is_rx_required).toBe(false);
  });

  it('membership order with Rx pair configs stays rx none (pairs carry their own Rx)', async () => {
    const { client, orderInsert } = buildClient();
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder({
      id: 9004, name: 'GV-9004',
      line_items: [{
        id: 114, product_id: 1, variant_id: 43038182735943, title: 'Membership', sku: 'SUB-1PAIR',
        price: '109.00', quantity: 1,
        properties: [
          { name: 'is_rx_required', value: 'false' },
          { name: '_pair_1', value: '{"v":43021235028039,"h":"dusk-wayfarer","l":"progressive","u":["progressive"],"t":"none"}' },
        ],
      }],
    }, client);

    expect(result.success).toBe(true);
    const inserted = (orderInsert.mock.calls[0] as unknown[])[0] as { rx_status: string };
    expect(inserted.rx_status).toBe('none');
  });
});
