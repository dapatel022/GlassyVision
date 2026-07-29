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

interface ClaimOpts {
  claimRows?: Array<{ id: string }>;
  shipmentInsertError?: boolean;
}

// Fully compliant fixture; the lab_jobs.update mock distinguishes the atomic
// claim (first call: .eq().is().select()) from later plain .eq() updates.
function installClient(opts: ClaimOpts = {}) {
  const { claimRows = [{ id: 'job-1' }], shipmentInsertError = false } = opts;

  const jobUpdate = vi.fn()
    .mockImplementationOnce(() => ({
      eq: () => ({ is: () => ({ select: () => Promise.resolve({ data: claimRows, error: null }) }) }),
    }))
    .mockImplementation(() => ({ eq: () => Promise.resolve({ error: null }) }));

  const shipmentInsert = vi.fn(() => ({
    select: () => ({
      single: () => Promise.resolve(
        shipmentInsertError ? { data: null, error: { message: 'boom' } } : { data: { id: 's-1' }, error: null },
      ),
    }),
  }));

  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'lab_jobs':
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'job-1', work_order_id: 'wo-1', column: 'ship', qc_photos: ['qc/1.jpg'], completed_at: null, shipment_id: null }, error: null }) }) }),
          update: jobUpdate,
        };
      case 'work_orders':
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { order_id: 'o-1', line_item_id: 'li-1', rx_file_id: 'rx-1', requires_rx: true, released_to_lab_at: '2026-05-01T00:00:00Z' }, error: null }) }) }) };
      case 'rx_files':
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'rx-1', storage_path: 'p', deleted_at: null, rx_expiration_date: null }, error: null }) }) }) };
      case 'rx_reviews':
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ decision: 'approved' }], error: null }) }) }) };
      case 'orders':
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { billing_country: 'us', shipping_address: { country_code: 'US' }, shopify_order_id: 555 }, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      case 'order_line_items':
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { shopify_line_item_id: 111 }, error: null }) }) }) };
      case 'shipments':
        return { insert: shipmentInsert };
      case 'subscription_redemptions':
        return { update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }) };
      default:
        return {};
    }
  });

  return { jobUpdate, shipmentInsert };
}

beforeEach(() => {
  mockFrom.mockReset();
  createFulfillment.mockClear();
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
});

describe('createShipment — atomic double-shipment claim', () => {
  it('returns already-shipped when the atomic claim matches no row (concurrent call won)', async () => {
    const { shipmentInsert } = installClient({ claimRows: [] });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('This job has already been shipped');
    expect(shipmentInsert).not.toHaveBeenCalled();
  });

  it('releases the claim when the shipments insert fails', async () => {
    const { jobUpdate } = installClient({ shipmentInsertError: true });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to create shipment');
    // Second update call is the rollback; it must clear completed_at.
    expect(jobUpdate).toHaveBeenCalledTimes(2);
    expect(jobUpdate.mock.calls[1][0]).toMatchObject({ completed_at: null });
  });

  it('rejects a whitespace-only tracking number server-side', async () => {
    installClient();
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: '   ' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Tracking number is required');
  });

  it('rejects an unknown carrier server-side', async () => {
    installClient();
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'PigeonPost', trackingNumber: 'TRK123' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown carrier');
  });

  it('trims the tracking number before storing it', async () => {
    const { shipmentInsert } = installClient();
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: '  TRK123  ' });
    expect(result.success).toBe(true);
    expect(shipmentInsert.mock.calls[0][0]).toMatchObject({ tracking_number: 'TRK123' });
  });

  it('ships on the happy path: claim, insert, then set shipment_id only', async () => {
    const { jobUpdate, shipmentInsert } = installClient();
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });

    expect(result.success).toBe(true);
    expect(shipmentInsert).toHaveBeenCalledTimes(1);
    // Call 1 = claim (completed_at), call 2 = shipment_id backfill.
    expect(jobUpdate).toHaveBeenCalledTimes(2);
    expect(jobUpdate.mock.calls[0][0]).toHaveProperty('completed_at');
    expect(jobUpdate.mock.calls[1][0]).toMatchObject({ shipment_id: 's-1' });
    expect(jobUpdate.mock.calls[1][0]).not.toHaveProperty('completed_at');
  });
});
