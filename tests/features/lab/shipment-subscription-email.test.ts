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

const sendEmail = vi.fn(async (_input: { to: string; subject: string }) => ({ success: true, providerMessageId: 'm-1' }));
vi.mock('@/lib/email/resend', () => ({ sendEmail: (input: { to: string; subject: string }) => sendEmail(input) }));

/**
 * @param isSubscription whether the order maps to a subscription redemption
 * @param priorComms     existing pair_shipped comms (for idempotency tests)
 */
function installClient(opts: { isSubscription: boolean; priorComms?: Array<{ metadata: unknown; status: string }> }) {
  const redemptionRow = opts.isSubscription
    ? [{ id: 'red-1', membership_id: 'mem-1' }]
    : [];
  const commsInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'comm-1' }, error: null }) }) }));
  const commsUpdate = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
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
      case 'subscription_redemptions':
        // advanceRedemptionForOrder: update().eq().select() returns advanced rows;
        // then create-shipment reads back the redemption for the email.
        return {
          update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: redemptionRow, error: null }) }) }),
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: redemptionRow, error: null }) }) }),
        };
      case 'subscription_memberships':
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { customer_id: 'cust-1' }, error: null }) }) }) };
      case 'customers':
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: 'sub@x.com', first_name: 'Sub' }, error: null }) }) }) };
      case 'communications':
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: opts.priorComms ?? [], error: null }) }) }),
          insert: commsInsert,
          update: commsUpdate,
        };
      default:
        return {};
    }
  });
  return { commsInsert };
}

const ORIG_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ORIG_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

beforeEach(() => { mockFrom.mockReset(); createFulfillment.mockClear(); sendEmail.mockClear(); });
afterEach(() => {
  process.env.SHOPIFY_STORE_DOMAIN = ORIG_DOMAIN;
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = ORIG_TOKEN;
});

describe('createShipment — pair_shipped email', () => {
  it('sends a pair_shipped email when the order maps to a subscription redemption', async () => {
    delete process.env.SHOPIFY_STORE_DOMAIN;
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    installClient({ isSubscription: true });

    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK', trackingUrl: 'https://t/x' });

    expect(result.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('sub@x.com');
    expect(sendEmail.mock.calls[0][0].subject.toLowerCase()).toMatch(/ship|on its way|track/);
  });

  it('does NOT send a pair_shipped email for a normal (non-subscription) order', async () => {
    delete process.env.SHOPIFY_STORE_DOMAIN;
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    installClient({ isSubscription: false });

    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });

    expect(result.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('is idempotent — does not re-send if a pair_shipped comm already exists', async () => {
    delete process.env.SHOPIFY_STORE_DOMAIN;
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    installClient({
      isSubscription: true,
      priorComms: [{ status: 'sent', metadata: { redemption_id: 'red-1' } }],
    });

    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });

    expect(result.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('still ships when the email send throws (best-effort, non-gating)', async () => {
    delete process.env.SHOPIFY_STORE_DOMAIN;
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    installClient({ isSubscription: true });
    sendEmail.mockRejectedValueOnce(new Error('resend down'));

    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });

    expect(result.success).toBe(true);
  });
});
