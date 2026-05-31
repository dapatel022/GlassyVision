import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockAdminFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-admin', () => ({
  adminFetch: mockAdminFetch,
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

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ORIGINAL_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

function buildRequest(authHeader?: string): NextRequest {
  const reqHeaders = new Headers();
  if (authHeader) reqHeaders.set('authorization', authHeader);
  return new NextRequest('http://localhost/api/cron/reconcile', {
    method: 'GET',
    headers: reqHeaders,
  });
}

describe('Reconciliation Cron Route Handler', () => {
  beforeEach(() => {
    mockAdminFetch.mockReset();
    mockFrom.mockReset();
    mockSyncShopifyOrder.mockReset();
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.SHOPIFY_STORE_DOMAIN = 'test.myshopify.com';
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'test-token';
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    process.env.SHOPIFY_STORE_DOMAIN = ORIGINAL_DOMAIN;
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = ORIGINAL_TOKEN;
  });

  it('rejects unauthorized requests with 401', async () => {
    const { GET } = await import('@/app/api/cron/reconcile/route');
    const req = buildRequest('Bearer wrong');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns stubbed message when Shopify env vars are missing', async () => {
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    const { GET } = await import('@/app/api/cron/reconcile/route');
    const req = buildRequest('Bearer test-cron-secret');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stubbed).toBe(true);
    expect(mockAdminFetch).not.toHaveBeenCalled();
  });

  it('scans and syncs new orders (gapFilledCount = 1)', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      orders: [{ id: 12345, name: 'GV-1001' }],
    });
    mockSyncShopifyOrder.mockResolvedValueOnce({ success: true });

    // Mock DB check (order does not exist)
    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') return { select: mockSelect };
      return {};
    });

    const { GET } = await import('@/app/api/cron/reconcile/route');
    const req = buildRequest('Bearer test-cron-secret');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.scannedCount).toBe(1);
    expect(body.gapFilledCount).toBe(1);
    expect(mockSyncShopifyOrder).toHaveBeenCalledWith({ id: 12345, name: 'GV-1001' }, expect.any(Object));
  });

  it('scans existing orders without incrementing gapFilledCount', async () => {
    mockAdminFetch.mockResolvedValueOnce({
      orders: [{ id: 12345, name: 'GV-1001' }],
    });
    mockSyncShopifyOrder.mockResolvedValueOnce({ success: true });

    // Mock DB check (order already exists)
    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'local-uuid' }, error: null })),
      })),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') return { select: mockSelect };
      return {};
    });

    const { GET } = await import('@/app/api/cron/reconcile/route');
    const req = buildRequest('Bearer test-cron-secret');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.scannedCount).toBe(1);
    expect(body.gapFilledCount).toBe(0);
  });
});
