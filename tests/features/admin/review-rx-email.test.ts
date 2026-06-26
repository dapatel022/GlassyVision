import { describe, it, expect, vi, beforeEach } from 'vitest';

// Email mocks must come before the action import.
const sendOnce = vi.fn();
vi.mock('@/lib/email/transactional', () => ({ sendOrderEmailOnce: (...a: unknown[]) => sendOnce(...a) }));
vi.mock('@/lib/email/templates/rx-approved', () => ({ renderRxApproved: () => ({ subject: 's', html: 'h', text: 't' }) }));

// Mirror review-rx.test.ts mock setup so reviewRx reaches the success path.
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

// Keep sendEmail stub so the rejection path doesn't break.
vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn(() => Promise.resolve({ success: true, providerMessageId: 'm1' })),
}));
vi.mock('@/features/rx-intake/lib/rx-token', () => ({ buildRxUrl: () => 'https://x/rx?token=t&exp=1' }));

function buildApproveMocks() {
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
  const orderSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({
        data: { customer_email: 'alex@example.com', shopify_order_number: 'GV-1001' },
        error: null,
      })),
    })),
  }));

  mockFrom.mockImplementation((table: string) => {
    if (table === 'rx_files') return { select: rxFileSelect };
    if (table === 'rx_reviews') return { insert: reviewInsert };
    if (table === 'audit_log') return { insert: auditInsert };
    if (table === 'orders') return { update: orderUpdate, select: orderSelect };
    return {};
  });
}

beforeEach(() => {
  sendOnce.mockReset();
  sendOnce.mockResolvedValue({ sent: true });
  mockFrom.mockReset();
  generateWorkOrderMock.mockReset();
  generateWorkOrderMock.mockResolvedValue({ success: true, workOrderId: 'wo-1', workOrderNumber: 'WO-202604-001' });
});

describe('reviewRx transactional email', () => {
  it('sends rx_approved exactly once on approve', async () => {
    buildApproveMocks();
    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');

    const result = await reviewRx({
      rxFileId: 'rx-1',
      decision: 'approved',
      decisionReason: 'clean_approved',
      notes: null,
    });

    expect(result.success).toBe(true);
    expect(sendOnce).toHaveBeenCalledWith(expect.objectContaining({ type: 'rx_approved' }));
  });

  it('does NOT send rx_approved on reject', async () => {
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
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { customer_email: 'a@x.com', shopify_order_number: 'GV-2' }, error: null }) }) }),
      };
      return {};
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');

    const result = await reviewRx({
      rxFileId: 'rx-2',
      decision: 'rejected',
      decisionReason: 'image_too_blurry',
      notes: 'Try again',
    });

    expect(result.success).toBe(true);
    expect(sendOnce).not.toHaveBeenCalled();
  });

  it('email failure does not change the approve success result', async () => {
    buildApproveMocks();
    sendOnce.mockRejectedValue(new Error('network'));

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');

    const result = await reviewRx({
      rxFileId: 'rx-1',
      decision: 'approved',
      decisionReason: 'clean_approved',
      notes: null,
    });

    expect(result.success).toBe(true);
  });
});
