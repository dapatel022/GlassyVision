import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

function buildRxFileRead(
  reviewDecision: 'approved' | 'rejected' | null = 'approved',
  image: { storage_path: string | null; deleted_at: string | null } = { storage_path: 'rx/1.jpg', deleted_at: null },
) {
  return vi.fn(() => ({
    eq: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({
        data: {
          id: 'rx-1',
          order_id: 'order-1',
          line_item_id: 'line-1',
          storage_path: image.storage_path,
          deleted_at: image.deleted_at,
          typed_od_sphere: '-2.00',
          typed_od_cylinder: '-0.75',
          typed_od_axis: '180',
          typed_os_sphere: '-1.50',
          typed_os_cylinder: '-0.50',
          typed_os_axis: '90',
          typed_pd: '63',
          typed_pd_type: 'binocular',
          rx_reviews: reviewDecision ? [{ decision: reviewDecision, reviewed_at: '2026-05-01T00:00:00Z' }] : [],
          order_line_items: {
            id: 'line-1',
            sku: 'GV-001-BLACK-M',
            product_title: 'Test Frame',
            frame_shape: 'round',
            frame_color: 'black',
            frame_size: 'M',
          },
        },
        error: null,
      })),
    })),
  }));
}

describe('generateWorkOrder', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('creates a work_order and lab_job when rx is approved', async () => {
    const workOrderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'wo-1', work_order_number: 'WO-202604-001' }, error: null })),
      })),
    }));
    const labJobInsert = vi.fn(() => Promise.resolve({ error: null }));
    const existingCountSelect = vi.fn(() => ({
      gte: vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: buildRxFileRead('approved') };
      if (table === 'orders') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { billing_country: 'us', shipping_address: { country_code: 'US' } }, error: null }) }) }) };
      if (table === 'work_orders') return {
        insert: workOrderInsert,
        select: existingCountSelect,
      };
      if (table === 'lab_jobs') return { insert: labJobInsert };
      // Status mirroring (Task 7) — no-op for a normal Shopify order.
      if (table === 'subscription_redemptions') return { update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }) };
      return {};
    });

    const { generateWorkOrder } = await import('@/features/admin/actions/generate-work-order');
    const result = await generateWorkOrder('rx-1');

    expect(result.success).toBe(true);
    expect(workOrderInsert).toHaveBeenCalledTimes(1);
    expect(labJobInsert).toHaveBeenCalledTimes(1);
    if (result.success) {
      expect(result.workOrderId).toBe('wo-1');
    }
  });

  it('refuses to generate a work order for a non-US/CA shipping destination', async () => {
    const workOrderInsert = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: buildRxFileRead('approved') };
      if (table === 'orders') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { billing_country: 'us', shipping_address: { country_code: 'GB' } }, error: null }) }) }) };
      if (table === 'work_orders') return { insert: workOrderInsert };
      return {};
    });

    const { generateWorkOrder } = await import('@/features/admin/actions/generate-work-order');
    const result = await generateWorkOrder('rx-1');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/US\/CA|dispens|restrict/i);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('refuses when rx has no approved review', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: buildRxFileRead('rejected') };
      return {};
    });

    const { generateWorkOrder } = await import('@/features/admin/actions/generate-work-order');
    const result = await generateWorkOrder('rx-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not approved/i);
    }
  });

  it('refuses when rx has no review at all', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: buildRxFileRead(null) };
      return {};
    });

    const { generateWorkOrder } = await import('@/features/admin/actions/generate-work-order');
    const result = await generateWorkOrder('rx-1');

    expect(result.success).toBe(false);
  });

  it('refuses when the Rx image file is missing (typed-only never reaches the lab)', async () => {
    const workOrderInsert = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: buildRxFileRead('approved', { storage_path: null, deleted_at: null }) };
      if (table === 'work_orders') return { insert: workOrderInsert };
      return {};
    });

    const { generateWorkOrder } = await import('@/features/admin/actions/generate-work-order');
    const result = await generateWorkOrder('rx-1');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/image/i);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('refuses when the most recent review (by reviewed_at) is a rejection, even if listed first', async () => {
    const workOrderInsert = vi.fn();
    const rxFileSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({
          data: {
            id: 'rx-1', order_id: 'order-1', line_item_id: 'line-1', storage_path: 'rx/1.jpg', deleted_at: null,
            typed_od_sphere: '-2.00', typed_od_cylinder: null, typed_od_axis: null, typed_od_add: null,
            typed_os_sphere: null, typed_os_cylinder: null, typed_os_axis: null, typed_os_add: null,
            typed_pd: '63', typed_pd_type: 'binocular',
            // Approval is OLDER; rejection is NEWER but appears first in the array.
            rx_reviews: [
              { decision: 'rejected', reviewed_at: '2026-05-10T00:00:00Z' },
              { decision: 'approved', reviewed_at: '2026-05-01T00:00:00Z' },
            ],
            order_line_items: { id: 'line-1', sku: 'GV-1', product_title: 'F', frame_shape: null, frame_color: null, frame_size: null },
          },
          error: null,
        })),
      })),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: rxFileSelect };
      if (table === 'work_orders') return { insert: workOrderInsert };
      return {};
    });

    const { generateWorkOrder } = await import('@/features/admin/actions/generate-work-order');
    const result = await generateWorkOrder('rx-1');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not approved/i);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('refuses when the Rx image was soft-deleted', async () => {
    const workOrderInsert = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: buildRxFileRead('approved', { storage_path: 'rx/1.jpg', deleted_at: '2026-05-02T00:00:00Z' }) };
      if (table === 'work_orders') return { insert: workOrderInsert };
      return {};
    });

    const { generateWorkOrder } = await import('@/features/admin/actions/generate-work-order');
    const result = await generateWorkOrder('rx-1');

    expect(result.success).toBe(false);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('refuses when the Rx is expired (no lens cut against a stale prescription)', async () => {
    const workOrderInsert = vi.fn();
    const rxFileSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({
          data: {
            id: 'rx-1', order_id: 'order-1', line_item_id: 'line-1', storage_path: 'rx/1.jpg', deleted_at: null,
            rx_expiration_date: '2020-01-01',
            typed_od_sphere: '-2.00', typed_od_cylinder: null, typed_od_axis: null, typed_od_add: null,
            typed_os_sphere: null, typed_os_cylinder: null, typed_os_axis: null, typed_os_add: null,
            typed_pd: '63', typed_pd_type: 'binocular',
            rx_reviews: [{ decision: 'approved', reviewed_at: '2026-05-01T00:00:00Z' }],
            order_line_items: { id: 'line-1', sku: 'GV-1', product_title: 'F', frame_shape: null, frame_color: null, frame_size: null },
          },
          error: null,
        })),
      })),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: rxFileSelect };
      if (table === 'work_orders') return { insert: workOrderInsert };
      return {};
    });

    const { generateWorkOrder } = await import('@/features/admin/actions/generate-work-order');
    const result = await generateWorkOrder('rx-1');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/expired/i);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });
});
