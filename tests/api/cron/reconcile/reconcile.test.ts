import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockAdminFetchPage = vi.fn();
vi.mock('@/lib/commerce/shopify-admin', () => ({
  adminFetchPage: mockAdminFetchPage,
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
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
  return new NextRequest('http://localhost/api/cron/reconcile', { method: 'GET', headers: reqHeaders });
}

// orders that don't yet exist locally
function ordersNotExistingClient() {
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) }));
  return (table: string) => (table === 'orders' ? { select } : {});
}

describe('Reconciliation Cron Route Handler', () => {
  beforeEach(() => {
    mockAdminFetchPage.mockReset();
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
    const res = await GET(buildRequest('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('returns stubbed message when Shopify env vars are missing', async () => {
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    const { GET } = await import('@/app/api/cron/reconcile/route');
    const res = await GET(buildRequest('Bearer test-cron-secret'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stubbed).toBe(true);
    expect(mockAdminFetchPage).not.toHaveBeenCalled();
  });

  it('scans and syncs new orders (gapFilledCount = 1)', async () => {
    mockAdminFetchPage.mockResolvedValueOnce({ data: { orders: [{ id: 12345, name: 'GV-1001' }] }, nextPageInfo: null });
    mockSyncShopifyOrder.mockResolvedValueOnce({ success: true });
    mockFrom.mockImplementation(ordersNotExistingClient());

    const { GET } = await import('@/app/api/cron/reconcile/route');
    const body = await (await GET(buildRequest('Bearer test-cron-secret'))).json();
    expect(body.success).toBe(true);
    expect(body.scannedCount).toBe(1);
    expect(body.gapFilledCount).toBe(1);
    expect(mockSyncShopifyOrder).toHaveBeenCalledWith({ id: 12345, name: 'GV-1001' }, expect.any(Object));
  });

  it('follows cursor pagination across multiple pages', async () => {
    mockAdminFetchPage
      .mockResolvedValueOnce({ data: { orders: [{ id: 1 }, { id: 2 }] }, nextPageInfo: 'CURSOR2' })
      .mockResolvedValueOnce({ data: { orders: [{ id: 3 }] }, nextPageInfo: null });
    mockSyncShopifyOrder.mockResolvedValue({ success: true });
    mockFrom.mockImplementation(ordersNotExistingClient());

    const { GET } = await import('@/app/api/cron/reconcile/route');
    const body = await (await GET(buildRequest('Bearer test-cron-secret'))).json();

    expect(mockAdminFetchPage).toHaveBeenCalledTimes(2);
    // second call must carry the page_info cursor from page 1
    expect(mockAdminFetchPage.mock.calls[1][0]).toContain('page_info=CURSOR2');
    expect(body.scannedCount).toBe(3);
    expect(body.pagesScanned).toBe(2);
    expect(mockSyncShopifyOrder).toHaveBeenCalledTimes(3);
  });
});
