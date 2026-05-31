import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'lab-1', email: 'l@x.com', role: 'lab_shipping', fullName: 'L' })),
  isLabRole: () => true,
}));

const createFulfillment = vi.fn(() => Promise.resolve({}));
vi.mock('@/lib/commerce/shopify-admin', () => ({ createFulfillment }));

function installCompliantClient() {
  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'lab_jobs':
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'job-1', work_order_id: 'wo-1', qc_photos: ['qc/1.jpg'] }, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      case 'work_orders':
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { order_id: 'o-1', line_item_id: 'li-1', rx_file_id: 'rx-1', released_to_lab_at: '2026-05-01T00:00:00Z' }, error: null }) }) }) };
      case 'rx_files':
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'rx-1', storage_path: 'p', deleted_at: null }, error: null }) }) }) };
      case 'rx_reviews':
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ decision: 'approved' }], error: null }) }) }) };
      case 'orders':
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { billing_country: 'us', shopify_order_id: 555 }, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      case 'order_line_items':
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { shopify_line_item_id: 111 }, error: null }) }) }) };
      case 'shipments':
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 's-1' }, error: null }) }) }) };
      default:
        return {};
    }
  });
}

const ORIG_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ORIG_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

beforeEach(() => {
  mockFrom.mockReset();
  createFulfillment.mockClear();
});
afterEach(() => {
  process.env.SHOPIFY_STORE_DOMAIN = ORIG_DOMAIN;
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = ORIG_TOKEN;
});

describe('createShipment — Shopify fulfillment push', () => {
  it('pushes fulfillment to Shopify when configured', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'x.myshopify.com';
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'tok';
    installCompliantClient();

    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });

    expect(result.success).toBe(true);
    expect(createFulfillment).toHaveBeenCalledWith(555, 'TRK', 'DHL', [111]);
  });

  it('does not call Shopify when env is not configured', async () => {
    delete process.env.SHOPIFY_STORE_DOMAIN;
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    installCompliantClient();

    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });

    expect(result.success).toBe(true);
    expect(createFulfillment).not.toHaveBeenCalled();
  });

  it('still succeeds locally when the Shopify push throws', async () => {
    process.env.SHOPIFY_STORE_DOMAIN = 'x.myshopify.com';
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'tok';
    createFulfillment.mockRejectedValueOnce(new Error('shopify 500'));
    installCompliantClient();

    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });

    expect(result.success).toBe(true);
  });
});
