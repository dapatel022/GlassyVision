import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'user-1', email: 'r@x.com', role: 'reviewer', fullName: 'R' })),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

const generateWorkOrderMock = vi.fn(() => Promise.resolve({ success: true, workOrderId: 'wo-1', workOrderNumber: 'WO-202604-001' }));
vi.mock('@/features/admin/actions/generate-work-order', () => ({
  generateWorkOrder: generateWorkOrderMock,
}));

const sendEmailMock = vi.fn((..._a: unknown[]) => Promise.resolve({ success: true, providerMessageId: 'm1' }));
vi.mock('@/lib/email/resend', () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));
vi.mock('@/features/rx-intake/lib/rx-token', () => ({ buildRxUrl: () => 'https://x/rx?token=t&exp=1' }));

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
      if (table === 'orders') return {
        update: orderUpdate,
        // rejection-email path reads the order for recipient + order number
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { customer_email: 'a@x.com', shopify_order_number: 'GV-2' }, error: null }) }) }),
      };
      return {};
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');

    const result = await reviewRx({
      rxFileId: 'rx-2',
      decision: 'rejected',
      decisionReason: 'image_too_blurry',
      notes: 'Try again with better lighting',
    });

    expect(result.success).toBe(true);
    expect(rxFileUpdate).toHaveBeenCalledTimes(1);
    const patch = (rxFileUpdate.mock.calls as unknown as Array<[{ deleted_at: string }]>)[0][0];
    expect(patch.deleted_at).toBeTruthy();
    // The customer is notified of the rejection.
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.com' }));
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
      decision: 'approved',
      decisionReason: 'clean_approved',
      notes: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rx file not found');
  });

  it('does NOT mark the order approved when work order generation fails, and removes the review so the Rx stays in the queue', async () => {
    generateWorkOrderMock.mockResolvedValueOnce({ success: false, error: 'Rx dispensing is restricted to US/CA in phase 1' } as never);

    const reviewInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'review-9' }, error: null })),
      })),
    }));
    const reviewDelete = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    const rxFileSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'rx-9', order_id: 'order-9' }, error: null })),
      })),
    }));
    const orderUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: rxFileSelect };
      if (table === 'rx_reviews') return { insert: reviewInsert, delete: reviewDelete };
      if (table === 'audit_log') return { insert: auditInsert };
      if (table === 'orders') return { update: orderUpdate };
      return {};
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');
    const result = await reviewRx({ rxFileId: 'rx-9', decision: 'approved', decisionReason: 'clean_approved', notes: null });

    expect(result.success).toBe(false);
    expect(result.error).toContain('US/CA');
    // The order must NOT be flipped to approved — that's the strand.
    expect(orderUpdate).not.toHaveBeenCalled();
    // The review row is removed so the Rx reappears in the queue.
    expect(reviewDelete).toHaveBeenCalledTimes(1);
  });

  it('marks the order approved only after work order generation succeeds', async () => {
    const callOrder: string[] = [];
    generateWorkOrderMock.mockImplementationOnce(async () => {
      callOrder.push('generate');
      return { success: true, workOrderId: 'wo-1', workOrderNumber: 'WO-202607-001' };
    });
    const reviewInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'review-10' }, error: null })),
      })),
    }));
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    const rxFileSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'rx-10', order_id: 'order-10' }, error: null })),
      })),
    }));
    const orderUpdate = vi.fn(() => {
      callOrder.push('status-update');
      return { eq: vi.fn(() => Promise.resolve({ error: null })) };
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: rxFileSelect };
      if (table === 'rx_reviews') return { insert: reviewInsert };
      if (table === 'audit_log') return { insert: auditInsert };
      if (table === 'orders') return {
        update: orderUpdate,
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { customer_email: 'a@x.com', shopify_order_number: 'GV-10' }, error: null }) }) }),
      };
      return {};
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');
    const result = await reviewRx({ rxFileId: 'rx-10', decision: 'approved', decisionReason: 'clean_approved', notes: null });

    expect(result.success).toBe(true);
    expect(callOrder).toEqual(['generate', 'status-update']);
  });

  it('rejects callers who are not admin/reviewer (privilege escalation guard)', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'lab-op-1', email: 'lab@x.com', role: 'lab_operator', fullName: 'L',
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');

    const result = await reviewRx({
      rxFileId: 'rx-1',
      decision: 'approved',
      decisionReason: 'clean_approved',
      notes: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
