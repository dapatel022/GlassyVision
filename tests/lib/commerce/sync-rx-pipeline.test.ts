import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// generateRxToken needs RX_TOKEN_SECRET; stub it so the day-0 email path runs.
vi.mock('@/features/rx-intake/lib/rx-token', () => ({
  generateRxToken: vi.fn(() => ({ token: 't', exp: 1 })),
}));

interface Captured {
  orderInsert: ReturnType<typeof vi.fn>;
  orderUpdate: ReturnType<typeof vi.fn>;
}

/** Fake client. `existingOrder` drives the new-vs-update path. */
function buildClient(existingOrder: { id: string; rx_status: string } | null): { client: SupabaseClient<Database> } & Captured {
  const orderInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'order-1' }, error: null }) }) }));
  const orderUpdate = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));

  const from = (table: string) => {
    switch (table) {
      case 'customers':
        return {
          upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'cust-1' }, error: null }) }) }),
          // Guest checkout (no shopify customer id) falls through to insert.
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'cust-1' }, error: null }) }) }),
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        };
      case 'orders':
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: existingOrder, error: null }) }) }),
          insert: orderInsert,
          update: orderUpdate,
        };
      case 'order_line_items':
        return {
          upsert: () => Promise.resolve({ error: null }),
        };
      case 'communications':
        // existingComm check (.eq.eq.maybeSingle) → none; then insert → null so
        // the email send is skipped.
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        };
      default:
        return {};
    }
  };
  return { client: { from } as unknown as SupabaseClient<Database>, orderInsert, orderUpdate };
}

function orderPayload(properties: Array<{ name: string; value: string }>) {
  return {
    id: 7001,
    name: 'GV-7001',
    line_items: [{ id: 1, title: 'Frame', quantity: 1, price: '95.00', properties }],
  };
}

beforeEach(() => vi.clearAllMocks());

describe('syncShopifyOrder — Rx pipeline trigger (C4)', () => {
  it('flags has_rx_items + awaiting_upload from an is_rx_required=true property', async () => {
    const { client, orderInsert } = buildClient(null);
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder(orderPayload([{ name: 'is_rx_required', value: 'true' }]), client);

    expect(result.success).toBe(true);
    const inserted = (orderInsert.mock.calls[0] as unknown[])[0] as { has_rx_items: boolean; rx_status: string };
    expect(inserted.has_rx_items).toBe(true);
    expect(inserted.rx_status).toBe('awaiting_upload');
  });

  it('still flags Rx when the key is sent as lens_type (underscore normalization)', async () => {
    const { client, orderInsert } = buildClient(null);
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder(orderPayload([{ name: 'lens_type', value: 'single_vision' }]), client);

    expect(result.success).toBe(true);
    const inserted = (orderInsert.mock.calls[0] as unknown[])[0] as { has_rx_items: boolean; rx_status: string };
    expect(inserted.has_rx_items).toBe(true);
    expect(inserted.rx_status).toBe('awaiting_upload');
  });

  it('leaves a non-Rx order as none', async () => {
    const { client, orderInsert } = buildClient(null);
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder(orderPayload([{ name: 'is_rx_required', value: 'false' }]), client);

    expect(result.success).toBe(true);
    const inserted = (orderInsert.mock.calls[0] as unknown[])[0] as { has_rx_items: boolean; rx_status: string };
    expect(inserted.has_rx_items).toBe(false);
    expect(inserted.rx_status).toBe('none');
  });
});

describe('syncShopifyOrder — preserves review state on update (C6)', () => {
  it('does NOT overwrite rx_status when updating an existing order', async () => {
    const { client, orderUpdate, orderInsert } = buildClient({ id: 'order-1', rx_status: 'approved' });
    const { syncShopifyOrder } = await import('@/lib/commerce/sync');
    const result = await syncShopifyOrder(orderPayload([{ name: 'is_rx_required', value: 'true' }]), client);

    expect(result.success).toBe(true);
    expect(orderInsert).not.toHaveBeenCalled();
    expect(orderUpdate).toHaveBeenCalledTimes(1);
    const patch = (orderUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    // rx_status (and created_at) must be absent so the review state survives.
    expect(patch).not.toHaveProperty('rx_status');
    expect(patch).not.toHaveProperty('created_at');
    // other fields still update
    expect(patch).toHaveProperty('has_rx_items', true);
  });
});
