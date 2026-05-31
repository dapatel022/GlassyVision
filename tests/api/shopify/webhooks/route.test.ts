import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockVerifyWebhook = vi.fn();
vi.mock('@/lib/utils/hmac', () => ({
  verifyShopifyWebhook: mockVerifyWebhook,
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const mockSyncShopifyOrder = vi.fn();
vi.mock('@/lib/commerce/sync', () => ({
  syncShopifyOrder: mockSyncShopifyOrder,
}));

function buildRequest(headers: Record<string, string>, body: string): NextRequest {
  const reqHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    reqHeaders.set(k, v);
  }
  return new NextRequest('http://localhost/api/shopify/webhooks', {
    method: 'POST',
    headers: reqHeaders,
    body,
  });
}

describe('Shopify Webhook Route Handler', () => {
  beforeEach(() => {
    mockVerifyWebhook.mockReset();
    mockFrom.mockReset();
    mockSyncShopifyOrder.mockReset();
  });

  it('returns 401 on invalid signature', async () => {
    mockVerifyWebhook.mockReturnValueOnce(false);
    const { POST } = await import('@/app/api/shopify/webhooks/route');

    const req = buildRequest({ 'x-shopify-hmac-sha256': 'bad' }, '{}');
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it('skips processing and returns 200 if webhook is duplicate (idempotency)', async () => {
    mockVerifyWebhook.mockReturnValueOnce(true);

    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'evt-1' }, error: null })),
      })),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'webhook_events') return { select: mockSelect };
      return {};
    });

    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const req = buildRequest(
      {
        'x-shopify-hmac-sha256': 'good',
        'x-shopify-webhook-id': 'dup-123',
      },
      '{}'
    );
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('already_processed');
    expect(mockSyncShopifyOrder).not.toHaveBeenCalled();
  });

  it('processes orders/create and logs event', async () => {
    mockVerifyWebhook.mockReturnValueOnce(true);
    mockSyncShopifyOrder.mockResolvedValueOnce({ success: true, orderId: 'ord-123' });

    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    }));
    const mockInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'log-1' }, error: null })),
      })),
    }));
    const mockUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'webhook_events') {
        return {
          select: mockSelect,
          insert: mockInsert,
          update: mockUpdate,
        };
      }
      return {};
    });

    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const payloadObj = { id: 1001, name: 'GV-1001' };
    const req = buildRequest(
      {
        'x-shopify-hmac-sha256': 'good',
        'x-shopify-topic': 'orders/create',
        'x-shopify-webhook-id': 'new-123',
      },
      JSON.stringify(payloadObj)
    );
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(mockSyncShopifyOrder).toHaveBeenCalledWith(payloadObj, expect.any(Object));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('processes orders/cancelled and deletes pending lab jobs', async () => {
    mockVerifyWebhook.mockReturnValueOnce(true);

    // Mock webhook_events select, insert, update
    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    }));
    const mockLogInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'log-1' }, error: null })),
      })),
    }));
    const mockLogUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    // Mock orders selection and update
    const mockOrderSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'ord-123' }, error: null })),
      })),
    }));
    const mockOrderUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    // Mock work orders selection
    const mockWorkOrdersSelect = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ data: [{ id: 'wo-1' }], error: null })),
    }));

    // Mock lab jobs deletion
    const mockLabJobsDelete = vi.fn(() => ({
      in: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve({ error: null })),
      })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'webhook_events') {
        return {
          select: mockSelect,
          insert: mockLogInsert,
          update: mockLogUpdate,
        };
      }
      if (table === 'orders') {
        return {
          select: mockOrderSelect,
          update: mockOrderUpdate,
        };
      }
      if (table === 'work_orders') {
        return {
          select: mockWorkOrdersSelect,
        };
      }
      if (table === 'lab_jobs') {
        return {
          delete: mockLabJobsDelete,
        };
      }
      return {};
    });

    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const req = buildRequest(
      {
        'x-shopify-hmac-sha256': 'good',
        'x-shopify-topic': 'orders/cancelled',
        'x-shopify-webhook-id': 'new-cancel',
      },
      JSON.stringify({ id: 1001 })
    );
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(mockOrderUpdate).toHaveBeenCalledTimes(1);
    expect(mockLabJobsDelete).toHaveBeenCalledTimes(1);
  });
});
