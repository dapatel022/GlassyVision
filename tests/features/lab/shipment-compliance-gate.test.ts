import { describe, it, expect, vi, beforeEach } from 'vitest';

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

interface ClientOpts {
  rxExpirationDate?: string | null;
  shippingAddress?: { country_code?: string } | null;
  billingCountry?: string | null;
}

// A fully compliant client, with the Rx expiration and ship-to destination
// parameterized so each test can exercise one gate in isolation.
function installClient(opts: ClientOpts = {}) {
  const { rxExpirationDate = null, shippingAddress = { country_code: 'US' }, billingCountry = 'us' } = opts;
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
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'rx-1', storage_path: 'p', deleted_at: null, rx_expiration_date: rxExpirationDate }, error: null }) }) }) };
      case 'rx_reviews':
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ decision: 'approved' }], error: null }) }) }) };
      case 'orders':
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { billing_country: billingCountry, shipping_address: shippingAddress, shopify_order_id: 555 }, error: null }) }) }),
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

beforeEach(() => {
  mockFrom.mockReset();
  createFulfillment.mockClear();
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
});

describe('createShipment — Rx expiration gate', () => {
  it('refuses to ship when the Rx expiration date is in the past', async () => {
    installClient({ rxExpirationDate: '2020-01-01' });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it('ships when the Rx expiration date is in the future', async () => {
    installClient({ rxExpirationDate: '2099-01-01' });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });
    expect(result.success).toBe(true);
  });

  it('ships when no expiration date is on file (admin review is the gate)', async () => {
    installClient({ rxExpirationDate: null });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });
    expect(result.success).toBe(true);
  });
});

describe('createShipment — destination market gate', () => {
  it('refuses to ship to a non-US/CA destination even when billing country is US', async () => {
    installClient({ shippingAddress: { country_code: 'GB' }, billingCountry: 'us' });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/US\/CA|dispens|restrict/i);
  });

  it('ships to a Canadian destination', async () => {
    installClient({ shippingAddress: { country_code: 'CA' }, billingCountry: 'us' });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });
    expect(result.success).toBe(true);
  });

  it('falls back to billing country when no shipping address is present', async () => {
    installClient({ shippingAddress: null, billingCountry: 'us' });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });
    expect(result.success).toBe(true);
  });
});
