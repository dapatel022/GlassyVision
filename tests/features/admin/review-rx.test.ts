import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

describe('reviewRx', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('creates rx_reviews and audit_log rows on approval', async () => {
    const reviewInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'review-1' }, error: null })),
      })),
    }));
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    const rxFileSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({
          data: { id: 'rx-1', order_id: 'order-1' },
          error: null,
        })),
      })),
    }));
    const orderUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: rxFileSelect };
      if (table === 'rx_reviews') return { insert: reviewInsert };
      if (table === 'audit_log') return { insert: auditInsert };
      if (table === 'orders') return { update: orderUpdate };
      return {};
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');

    const result = await reviewRx({
      rxFileId: 'rx-1',
      reviewerUserId: 'user-1',
      decision: 'approved',
      decisionReason: 'clean_approved',
      notes: null,
    });

    expect(result.success).toBe(true);
    expect(reviewInsert).toHaveBeenCalledTimes(1);
    expect(auditInsert).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes rx_file on rejection', async () => {
    const reviewInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'review-2' }, error: null })),
      })),
    }));
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    const rxFileSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({
          data: { id: 'rx-2', order_id: 'order-2' },
          error: null,
        })),
      })),
    }));
    const orderUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));
    const rxFileUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: rxFileSelect, update: rxFileUpdate };
      if (table === 'rx_reviews') return { insert: reviewInsert };
      if (table === 'audit_log') return { insert: auditInsert };
      if (table === 'orders') return { update: orderUpdate };
      return {};
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');

    const result = await reviewRx({
      rxFileId: 'rx-2',
      reviewerUserId: 'user-1',
      decision: 'rejected',
      decisionReason: 'image_too_blurry',
      notes: 'Try again with better lighting',
    });

    expect(result.success).toBe(true);
    expect(rxFileUpdate).toHaveBeenCalledTimes(1);
    const patch = rxFileUpdate.mock.calls[0][0] as { deleted_at: string };
    expect(patch.deleted_at).toBeTruthy();
  });

  it('returns error when rx_file is not found', async () => {
    const rxFileSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'not found' } })),
      })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: rxFileSelect };
      return {};
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');

    const result = await reviewRx({
      rxFileId: 'rx-missing',
      reviewerUserId: 'user-1',
      decision: 'approved',
      decisionReason: 'clean_approved',
      notes: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rx file not found');
  });
});
