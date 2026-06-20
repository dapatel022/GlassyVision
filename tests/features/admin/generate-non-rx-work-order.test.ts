import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from: mockFrom })) }));

const getCurrentUser = vi.fn(() => Promise.resolve({ id: 'admin-1', email: 'a@x.com', role: 'founder', fullName: 'A' }));
vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: () => getCurrentUser(),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

const advanceRedemptionForOrder = vi.fn((..._a: unknown[]) => Promise.resolve({ advanced: false }));
vi.mock('@/features/subscriptions/advance-redemption', () => ({
  advanceRedemptionForOrder: (...a: unknown[]) => advanceRedemptionForOrder(...a),
}));

// A non-Rx, paid, US line item with no existing work order.
function installClient(opts: {
  isRxRequired?: boolean;
  financialStatus?: string;
  country?: string;
  existingWo?: { id: string; work_order_number: string } | null;
} = {}) {
  const { isRxRequired = false, financialStatus = 'paid', country = 'US', existingWo = null } = opts;
  const workOrderInsert = vi.fn((_row: Record<string, unknown>) => ({
    select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'wo-9', work_order_number: 'WO-202606-009' }, error: null })) })),
  }));
  const labJobInsert = vi.fn(() => Promise.resolve({ error: null }));
  mockFrom.mockImplementation((table: string) => {
    if (table === 'order_line_items') return {
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: {
        id: 'li-1', order_id: 'o-1', sku: 'GV-SUN-01', product_title: 'Sun', frame_shape: 'square', frame_color: 'black', frame_size: 'M', is_rx_required: isRxRequired,
        orders: { financial_status: financialStatus, billing_country: country.toLowerCase(), shipping_address: { country_code: country } },
      }, error: null }) }) }),
    };
    if (table === 'work_orders') return {
      // select() serves TWO queries: idempotency (.eq().eq().maybeSingle()) and
      // the monthly count (.gte()). Both branch off the same select() object.
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: existingWo, error: null }) }) }),
        gte: () => Promise.resolve({ data: [], error: null, count: 0 }),
      }),
      insert: workOrderInsert,
    };
    if (table === 'lab_jobs') return { insert: labJobInsert };
    if (table === 'audit_log') return { insert: vi.fn(() => Promise.resolve({ error: null })) };
    return {};
  });
  return { workOrderInsert, labJobInsert };
}

beforeEach(() => { mockFrom.mockReset(); advanceRedemptionForOrder.mockClear(); getCurrentUser.mockClear(); });

describe('generateNonRxWorkOrder', () => {
  it('rejects a non-admin caller before any DB write', async () => {
    getCurrentUser.mockResolvedValueOnce({ id: 'c-1', email: 'c@x.com', role: 'customer', fullName: 'C' });
    const { workOrderInsert } = installClient();
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(false);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('rejects a line item that requires a prescription', async () => {
    const { workOrderInsert } = installClient({ isRxRequired: true });
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/prescription|rx queue/i);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('rejects an unpaid order', async () => {
    const { workOrderInsert } = installClient({ financialStatus: 'pending' });
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/paid/i);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('rejects a non-US/CA destination', async () => {
    const { workOrderInsert } = installClient({ country: 'GB' });
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(false);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('creates a non-Rx work order (requires_rx=false, null rx_file_id) + lab job and advances any linked redemption', async () => {
    const { workOrderInsert, labJobInsert } = installClient();
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(true);
    expect(workOrderInsert).toHaveBeenCalledTimes(1);
    const inserted = workOrderInsert.mock.calls[0][0];
    expect(inserted.requires_rx).toBe(false);
    expect(inserted.rx_file_id ?? null).toBeNull();
    expect(inserted.lens_type).toBe('non_prescription');
    expect(inserted.released_to_lab_at).toBeTruthy();
    expect(labJobInsert).toHaveBeenCalledTimes(1);
    expect(advanceRedemptionForOrder).toHaveBeenCalledWith('o-1', 'in_production', expect.anything(), expect.objectContaining({ workOrderId: 'wo-9' }));
  });

  it('is idempotent — returns the existing work order without inserting a duplicate', async () => {
    const { workOrderInsert } = installClient({ existingWo: { id: 'wo-existing', work_order_number: 'WO-202606-001' } });
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.workOrderId).toBe('wo-existing');
    expect(workOrderInsert).not.toHaveBeenCalled();
  });
});
