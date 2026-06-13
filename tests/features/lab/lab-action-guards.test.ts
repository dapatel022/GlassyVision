import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks --------------------------------------------------------------
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() =>
    Promise.resolve({ id: 'lab-1', email: 'lab@x.com', role: 'lab_operator', fullName: 'L' }),
  ),
  isLabRole: (role: string) =>
    ['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'].includes(role),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

// Happy-path data builders. Override one field per failing-case test.
interface ClientOverrides {
  job?: unknown;
  wo?: unknown;
  rxFile?: unknown;
  reviews?: unknown;
  order?: unknown;
  shipmentInsert?: ReturnType<typeof vi.fn>;
  jobUpdate?: ReturnType<typeof vi.fn>;
  orderUpdate?: ReturnType<typeof vi.fn>;
}

function installClient(o: ClientOverrides = {}) {
  const job = 'job' in o ? o.job : { id: 'job-1', work_order_id: 'wo-1', column: 'qc', qc_photos: ['qc/1.jpg'], started_at: '2026-05-01T00:00:00Z' };
  const wo = 'wo' in o ? o.wo : { order_id: 'order-1', rx_file_id: 'rx-1', released_to_lab_at: '2026-05-01T00:00:00Z' };
  const rxFile = 'rxFile' in o ? o.rxFile : { id: 'rx-1', storage_path: 'rx/1.jpg', deleted_at: null };
  const reviews = 'reviews' in o ? o.reviews : [{ decision: 'approved' }];
  const order = 'order' in o ? o.order : { billing_country: 'us' };

  const shipmentInsert = o.shipmentInsert ?? vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'ship-1' }, error: null }) }) }));
  const jobUpdate = o.jobUpdate ?? vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  const orderUpdate = o.orderUpdate ?? vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));

  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'lab_jobs':
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: job, error: null }) }) }),
          update: jobUpdate,
        };
      case 'work_orders':
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: wo, error: null }) }) }) };
      case 'rx_files':
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: rxFile, error: null }) }) }) };
      case 'rx_reviews':
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: reviews, error: null }) }) }) };
      case 'orders':
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: order, error: null }) }) }),
          update: orderUpdate,
        };
      case 'shipments':
        return { insert: shipmentInsert };
      case 'order_line_items':
        // Fulfillment push reads the Shopify line item id; orders carries no
        // shopify_order_id here, so createFulfillment is skipped either way.
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { shopify_line_item_id: 111 }, error: null }) }) }) };
      case 'audit_log':
        return { insert: () => Promise.resolve({ error: null }) };
      case 'subscription_redemptions':
        // status mirroring (Task 7) — no-op for these normal-order tests.
        return { update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }) };
      default:
        return {};
    }
  });
  return { shipmentInsert, jobUpdate, orderUpdate };
}

beforeEach(() => {
  mockFrom.mockReset();
});

// --- createShipment: auth ----------------------------------------------
describe('createShipment — authorization', () => {
  it('rejects unauthenticated callers without touching the DB', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    installClient();

    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects admin-only (non-lab) reviewers', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'r-1', email: 'r@x.com', role: 'reviewer', fullName: 'R' });
    installClient();

    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// --- createShipment: compliance gate -----------------------------------
describe('createShipment — compliance gate (THE shipment line)', () => {
  it('ships on the fully-compliant happy path', async () => {
    const { shipmentInsert, orderUpdate } = installClient();
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });
    expect(result.success).toBe(true);
    expect(shipmentInsert).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledTimes(1);
  });

  it('blocks shipment when work order has no Rx file on record', async () => {
    const { shipmentInsert } = installClient({ wo: { order_id: 'order-1', rx_file_id: null, released_to_lab_at: '2026-05-01T00:00:00Z' } });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rx/i);
    expect(shipmentInsert).not.toHaveBeenCalled();
  });

  it('blocks shipment when the Rx image was soft-deleted', async () => {
    const { shipmentInsert } = installClient({ rxFile: { id: 'rx-1', storage_path: 'rx/1.jpg', deleted_at: '2026-05-02T00:00:00Z' } });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });
    expect(result.success).toBe(false);
    expect(shipmentInsert).not.toHaveBeenCalled();
  });

  it('blocks shipment when the Rx was never approved', async () => {
    const { shipmentInsert } = installClient({ reviews: [{ decision: 'rejected' }] });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/approv/i);
    expect(shipmentInsert).not.toHaveBeenCalled();
  });

  it('blocks shipment when the work order was never released to the lab', async () => {
    const { shipmentInsert } = installClient({ wo: { order_id: 'order-1', rx_file_id: 'rx-1', released_to_lab_at: null } });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/releas/i);
    expect(shipmentInsert).not.toHaveBeenCalled();
  });

  it('blocks shipment when QC photos are missing', async () => {
    const { shipmentInsert } = installClient({ job: { id: 'job-1', work_order_id: 'wo-1', column: 'qc', qc_photos: [], started_at: '2026-05-01T00:00:00Z' } });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/qc/i);
    expect(shipmentInsert).not.toHaveBeenCalled();
  });

  it('ships when billing_country is stored uppercase (US/CA), case-insensitively', async () => {
    const { shipmentInsert } = installClient({ order: { billing_country: 'US' } });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });
    expect(result.success).toBe(true);
    expect(shipmentInsert).toHaveBeenCalledTimes(1);
  });

  it('blocks shipment to a non-US/CA destination (UK phase-1 rule)', async () => {
    const { shipmentInsert } = installClient({ order: { billing_country: 'gb' } });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'X' });
    expect(result.success).toBe(false);
    expect(shipmentInsert).not.toHaveBeenCalled();
  });
});

// --- moveJob: auth + no-skip-to-ship -----------------------------------
describe('moveJob — authorization & ship gate', () => {
  it('rejects unauthenticated callers without touching the DB', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    installClient();
    const { moveJob } = await import('@/features/lab/actions/move-job');
    const result = await moveJob('job-1', 'ship');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('blocks a job from jumping straight to ship without release + QC', async () => {
    // Job sitting in inbox, no QC photos, not released.
    installClient({
      job: { id: 'job-1', work_order_id: 'wo-1', column: 'inbox', qc_photos: [], started_at: null },
      wo: { order_id: 'order-1', rx_file_id: 'rx-1', released_to_lab_at: null },
    });
    const { moveJob } = await import('@/features/lab/actions/move-job');
    const result = await moveJob('job-1', 'ship');
    expect(result.success).toBe(false);
  });
});

// --- addQcPhoto: auth ---------------------------------------------------
describe('addQcPhoto — authorization', () => {
  it('rejects unauthenticated callers without touching the DB', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    installClient();
    const { addQcPhoto } = await import('@/features/lab/actions/add-qc-photo');
    const result = await addQcPhoto('job-1', 'qc/2.jpg');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
