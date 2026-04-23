import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

function buildRxFileRead(reviewDecision: 'approved' | 'rejected' | null = 'approved') {
  return vi.fn(() => ({
    eq: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({
        data: {
          id: 'rx-1',
          order_id: 'order-1',
          line_item_id: 'line-1',
          typed_od_sphere: '-2.00',
          typed_od_cylinder: '-0.75',
          typed_od_axis: '180',
          typed_os_sphere: '-1.50',
          typed_os_cylinder: '-0.50',
          typed_os_axis: '90',
          typed_pd: '63',
          typed_pd_type: 'binocular',
          rx_reviews: reviewDecision ? [{ decision: reviewDecision }] : [],
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
      if (table === 'work_orders') return {
        insert: workOrderInsert,
        select: existingCountSelect,
      };
      if (table === 'lab_jobs') return { insert: labJobInsert };
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
});
