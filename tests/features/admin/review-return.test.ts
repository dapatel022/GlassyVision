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

function makeReturnsTable(opts: { claimRows: Array<{ id: string }>; finalUpdateError?: boolean }) {
  const claimSelect = vi.fn(() => Promise.resolve({ data: opts.claimRows, error: null }));
  // First update call = the claim (.eq('id').eq('status','pending').select());
  // second = finalize (.eq('id') awaited directly, optionally failing);
  // any later call = rollback (always succeeds).
  const update = vi.fn()
    .mockImplementationOnce(() => ({ eq: () => ({ eq: () => ({ select: claimSelect }) }) }))
    .mockImplementationOnce(() => ({ eq: () => Promise.resolve({ error: opts.finalUpdateError ? { message: 'db down' } : null }) }))
    .mockImplementation(() => ({ eq: () => Promise.resolve({ error: null }) }));
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: RET_ROW, error: null })) })),
  }));
  return { table: { select, update }, update };
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

  it('does NOT release the claim when the decision save fails AFTER a refund was issued (retry would double-refund), and audit-logs the refund', async () => {
    const returns = makeReturnsTable({ claimRows: [{ id: 'ret-1' }], finalUpdateError: true });
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'returns') return returns.table;
      if (table === 'audit_log') return { insert: auditInsert };
      return {};
    });

    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'ret-1', decision: 'approved_refund', adminNotes: null });

    expect(result.success).toBe(false);
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    // Claim + failed finalize only — NO rollback to pending, which would let a
    // retry pass the claim and refund a second time.
    expect(returns.update).toHaveBeenCalledTimes(2);
    // The refund id must survive somewhere durable: the audit log.
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'return_decision_persist_failed',
      after_data: expect.objectContaining({ shopify_refund_id: 555 }),
    }));
  });

  it('releases the claim when the decision save fails and NO refund was issued (safe to retry)', async () => {
    const returns = makeReturnsTable({ claimRows: [{ id: 'ret-1' }], finalUpdateError: true });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'returns') return returns.table;
      return {};
    });

    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'ret-1', decision: 'rejected', adminNotes: 'not eligible' });

    expect(result.success).toBe(false);
    expect(createRefundMock).not.toHaveBeenCalled();
    // Claim + failed finalize + rollback to pending.
    expect(returns.update).toHaveBeenCalledTimes(3);
    expect(returns.update.mock.calls[2][0]).toMatchObject({ status: 'pending' });
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
