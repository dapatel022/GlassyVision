import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'admin-1', email: 'a@x.com', role: 'founder', fullName: 'A' })),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

const createRefundMock = vi.fn((..._a: unknown[]) => Promise.resolve({ refund: { id: 555 } }));
vi.mock('@/lib/commerce/shopify-admin', () => ({
  createRefund: (...a: unknown[]) => createRefundMock(...a),
}));

const RET_ROW = {
  id: 'ret-1', status: 'pending', order_id: 'order-1', line_item_id: 'li-1', preferred_resolution: 'refund',
  orders: { shopify_order_id: 9001, currency: 'USD', total: 200 },
  order_line_items: { line_total: 50 },
};

function makeReturnsTable(opts: { claimRows: Array<{ id: string }> }) {
  const claimSelect = vi.fn(() => Promise.resolve({ data: opts.claimRows, error: null }));
  const finalEq = vi.fn(() => Promise.resolve({ error: null }));
  // First update call = the claim (.eq('id').eq('status','pending').select());
  // later update calls = finalize / rollback (.eq('id') awaited directly).
  const update = vi.fn()
    .mockImplementationOnce(() => ({ eq: () => ({ eq: () => ({ select: claimSelect }) }) }))
    .mockImplementation(() => ({ eq: finalEq }));
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: RET_ROW, error: null })) })),
  }));
  return { table: { select, update }, update, finalEq };
}

describe('reviewReturn', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    createRefundMock.mockClear();
  });

  it('claims the return atomically, refunds once, and completes', async () => {
    const returns = makeReturnsTable({ claimRows: [{ id: 'ret-1' }] });
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'returns') return returns.table;
      if (table === 'audit_log') return { insert: auditInsert };
      return {};
    });

    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'ret-1', decision: 'approved_refund', adminNotes: null });

    expect(result.success).toBe(true);
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    expect(returns.update).toHaveBeenCalledTimes(2); // claim + finalize
  });

  it('does NOT refund when the claim is lost (concurrent double-submit)', async () => {
    const returns = makeReturnsTable({ claimRows: [] });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'returns') return returns.table;
      return {};
    });

    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'ret-1', decision: 'approved_refund', adminNotes: null });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Return is not pending');
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it('rolls the claim back to pending when the Shopify refund fails', async () => {
    createRefundMock.mockRejectedValueOnce(new Error('shopify 502'));
    const returns = makeReturnsTable({ claimRows: [{ id: 'ret-1' }] });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'returns') return returns.table;
      return {};
    });

    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'ret-1', decision: 'approved_refund', adminNotes: null });

    expect(result.success).toBe(false);
    // Second update call is the rollback; it must set status back to 'pending'.
    expect(returns.update).toHaveBeenCalledTimes(2);
    expect(returns.update.mock.calls[1][0]).toMatchObject({ status: 'pending' });
  });
});
