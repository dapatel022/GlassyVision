import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockVerifyWebhook = vi.fn();
vi.mock('@/lib/utils/hmac', () => ({
  verifyShopifyWebhook: mockVerifyWebhook,
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

const mockSyncShopifyOrder = vi.fn();
vi.mock('@/lib/commerce/sync', () => ({
  syncShopifyOrder: mockSyncShopifyOrder,
}));

const mockProvision = vi.fn();
vi.mock('@/features/subscriptions/provision-membership', () => ({
  provisionMembershipFromOrder: mockProvision,
}));

function buildRequest(headers: Record<string, string>, body: string): NextRequest {
  const reqHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) reqHeaders.set(k, v);
  return new NextRequest('http://localhost/api/shopify/webhooks', { method: 'POST', headers: reqHeaders, body });
}

// webhook_events.insert(...).select('id').single() => { data, error }
function eventInsert(result: { data: unknown; error: unknown }) {
  return vi.fn(() => ({ select: () => ({ single: () => Promise.resolve(result) }) }));
}
// webhook_events.select('id, processed_at').eq(...).maybeSingle()
function eventSelect(result: { data: unknown; error: unknown }) {
  return vi.fn(() => ({ eq: () => ({ maybeSingle: () => Promise.resolve(result) }) }));
}
function eventUpdate() {
  return vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
}
// orders.select(...).eq('shopify_order_id', id).maybeSingle() — for post-sync
// subscription-provisioning lookup. Returning a null row makes provisioning a
// safe no-op (non-membership order).
function ordersSelect(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  return vi.fn(() => ({ eq: () => ({ maybeSingle: () => Promise.resolve(result) }) }));
}

beforeEach(() => {
  mockVerifyWebhook.mockReset();
  mockFrom.mockReset();
  mockSyncShopifyOrder.mockReset();
  mockProvision.mockReset();
  mockProvision.mockResolvedValue({ provisioned: false });
});

describe('Shopify Webhook Route Handler', () => {
  it('returns 401 on invalid signature', async () => {
    mockVerifyWebhook.mockReturnValueOnce(false);
    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(buildRequest({ 'x-shopify-hmac-sha256': 'bad' }, '{}'));
    expect(res.status).toBe(401);
  });

  it('records the event atomically and processes orders/create', async () => {
    mockVerifyWebhook.mockReturnValueOnce(true);
    mockSyncShopifyOrder.mockResolvedValueOnce({ success: true, orderId: 'ord-123' });
    const update = eventUpdate();
    mockFrom.mockImplementation((t: string) => {
      if (t === 'webhook_events') return { insert: eventInsert({ data: { id: 'log-1' }, error: null }), update };
      if (t === 'orders') return { select: ordersSelect() };
      return {};
    });

    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const payloadObj = { id: 1001, name: 'GV-1001' };
    const res = await POST(buildRequest(
      { 'x-shopify-hmac-sha256': 'good', 'x-shopify-topic': 'orders/create', 'x-shopify-webhook-id': 'new-123' },
      JSON.stringify(payloadObj),
    ));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(mockSyncShopifyOrder).toHaveBeenCalledWith(payloadObj, expect.any(Object));
    expect(update).toHaveBeenCalledTimes(1); // processed_at set
  });

  it('skips an already-processed duplicate (insert hits unique violation, prior attempt completed)', async () => {
    mockVerifyWebhook.mockReturnValueOnce(true);
    mockFrom.mockImplementation((t: string) =>
      t === 'webhook_events'
        ? {
            insert: eventInsert({ data: null, error: { code: '23505', message: 'duplicate key' } }),
            select: eventSelect({ data: { id: 'evt-1', processed_at: '2026-05-30T00:00:00Z' }, error: null }),
          }
        : {},
    );

    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(buildRequest(
      { 'x-shopify-hmac-sha256': 'good', 'x-shopify-topic': 'orders/create', 'x-shopify-webhook-id': 'dup-123' },
      '{"id":1}',
    ));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('already_processed');
    expect(mockSyncShopifyOrder).not.toHaveBeenCalled();
  });

  it('reprocesses a redelivered event whose prior attempt failed (processed_at is null)', async () => {
    mockVerifyWebhook.mockReturnValueOnce(true);
    mockSyncShopifyOrder.mockResolvedValueOnce({ success: true, orderId: 'ord-9' });
    const update = eventUpdate();
    mockFrom.mockImplementation((t: string) => {
      if (t === 'webhook_events') return {
        insert: eventInsert({ data: null, error: { code: '23505', message: 'duplicate key' } }),
        select: eventSelect({ data: { id: 'evt-2', processed_at: null }, error: null }),
        update,
      };
      if (t === 'orders') return { select: ordersSelect() };
      return {};
    });

    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(buildRequest(
      { 'x-shopify-hmac-sha256': 'good', 'x-shopify-topic': 'orders/create', 'x-shopify-webhook-id': 'retry-1' },
      '{"id":9}',
    ));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(mockSyncShopifyOrder).toHaveBeenCalledTimes(1);
  });

  it('syncs and runs subscription provisioning on orders/paid', async () => {
    mockVerifyWebhook.mockReturnValueOnce(true);
    mockSyncShopifyOrder.mockResolvedValueOnce({ success: true, orderId: 'ord-paid' });
    const update = eventUpdate();
    const orderRow = { id: 'ord-paid', shopify_order_id: 2002, customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd', financial_status: 'paid' };
    mockFrom.mockImplementation((t: string) => {
      if (t === 'webhook_events') return { insert: eventInsert({ data: { id: 'log-paid' }, error: null }), update };
      if (t === 'orders') return { select: ordersSelect({ data: orderRow, error: null }) };
      return {};
    });

    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(buildRequest(
      { 'x-shopify-hmac-sha256': 'good', 'x-shopify-topic': 'orders/paid', 'x-shopify-webhook-id': 'paid-1' },
      JSON.stringify({ id: 2002, name: 'GV-2002' }),
    ));
    expect(res.status).toBe(200);
    expect(mockSyncShopifyOrder).toHaveBeenCalledTimes(1);
    expect(mockProvision).toHaveBeenCalledWith(orderRow, expect.any(Object));
  });

  it('returns 500 (so Shopify retries) when a handler fails, and records the error', async () => {
    mockVerifyWebhook.mockReturnValueOnce(true);
    mockSyncShopifyOrder.mockResolvedValueOnce({ success: false, error: 'boom' });
    const update = eventUpdate();
    mockFrom.mockImplementation((t: string) =>
      t === 'webhook_events'
        ? { insert: eventInsert({ data: { id: 'log-err' }, error: null }), update }
        : {},
    );

    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(buildRequest(
      { 'x-shopify-hmac-sha256': 'good', 'x-shopify-topic': 'orders/create', 'x-shopify-webhook-id': 'fail-1' },
      '{"id":2}',
    ));
    expect(res.status).toBe(500);
    expect(update).toHaveBeenCalledTimes(1); // processing_error recorded
  });
});
