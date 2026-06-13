import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/features/rx-intake/lib/rx-token', () => ({
  verifyRxToken: vi.fn(() => true),
}));

const TOKEN = { token: 'valid', exp: 9999999999999 };

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'order-uuid',
    publicOrderId: 'GV-1001',
    ...TOKEN,
    lineItemId: 'line-1',
    requestType: 'return' as const,
    reason: 'change_of_mind' as const,
    reasonDetail: '',
    preferredResolution: 'refund' as const,
    photoUrls: [],
    ...overrides,
  };
}

/** Wire up the orders/order_line_items/returns reads + insert for a happy path. */
function installClient(opts: { order?: unknown; lineItem?: unknown } = {}) {
  const order = 'order' in opts ? opts.order : { id: 'order-uuid', customer_email: 'a@x.com', shopify_order_number: 'GV-1001' };
  const lineItem = 'lineItem' in opts ? opts.lineItem : { id: 'line-1' };
  const returnsInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'ret-1' }, error: null }) }) }));

  mockFrom.mockImplementation((table: string) => {
    if (table === 'orders') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: order, error: null }) }) }) };
    }
    if (table === 'order_line_items') {
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: lineItem, error: null }) }) }) }) };
    }
    if (table === 'returns') {
      return {
        select: () => ({ gte: () => Promise.resolve({ count: 0, error: null }) }),
        insert: returnsInsert,
      };
    }
    return {};
  });
  return { returnsInsert };
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe('requestReturn', () => {
  it('rejects an invalid/expired token before touching the DB', async () => {
    const { verifyRxToken } = await import('@/features/rx-intake/lib/rx-token');
    vi.mocked(verifyRxToken).mockReturnValueOnce(false);

    const { requestReturn } = await import('@/features/returns/actions/request-return');
    const result = await requestReturn(baseInput({ token: 'forged' }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/invalid|expired/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects when the order UUID resolves to a different order number', async () => {
    installClient({ order: { id: 'order-uuid', customer_email: 'a@x.com', shopify_order_number: 'GV-9999' } });
    const { requestReturn } = await import('@/features/returns/actions/request-return');
    const result = await requestReturn(baseInput());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not found/i);
  });

  it('rejects when the line item does not belong to the order', async () => {
    installClient({ lineItem: null });
    const { requestReturn } = await import('@/features/returns/actions/request-return');
    const result = await requestReturn(baseInput());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/line item/i);
  });

  it('creates a return on the happy path', async () => {
    const { returnsInsert } = installClient();
    const { requestReturn } = await import('@/features/returns/actions/request-return');
    const result = await requestReturn(baseInput());
    expect(result.success).toBe(true);
    if (result.success) expect(result.rmaNumber).toMatch(/^RMA-/);
    expect(returnsInsert).toHaveBeenCalledTimes(1);
  });
});
