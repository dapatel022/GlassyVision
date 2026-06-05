import { describe, it, expect, vi, beforeEach } from 'vitest';

const adminFetch = vi.fn();
vi.mock('@/lib/commerce/admin-fetch', () => ({ adminFetch: (...a: unknown[]) => adminFetch(...a) }));
import { createRefund } from '@/lib/commerce/shopify-admin';

describe('createRefund (calculate-then-refund)', () => {
  beforeEach(() => adminFetch.mockReset());

  it('calculates before refunding and uses returned shipping', async () => {
    adminFetch
      .mockResolvedValueOnce({
        refund: {
          shipping: { amount: '5.00' },
          transactions: [{ kind: 'suggested_refund', amount: '100.00', parent_id: 1, gateway: 'bogus' }],
        },
      }) // calculate
      .mockResolvedValueOnce({ refund: { id: 999 } }); // create
    await createRefund(123, 100, 'USD', 'cancel');
    const calcCall = adminFetch.mock.calls[0][0] as string;
    const createBody = adminFetch.mock.calls[1][1] as {
      body: { refund: { shipping: { amount: string } } };
    };
    expect(calcCall).toContain('refunds/calculate.json');
    expect(createBody.body.refund.shipping.amount).toBe('5.00');
  });

  it('throws if requested amount exceeds captured/suggested', async () => {
    adminFetch.mockResolvedValueOnce({
      refund: { shipping: { amount: '0.00' }, transactions: [{ kind: 'suggested_refund', amount: '50.00' }] },
    });
    await expect(createRefund(123, 100, 'USD', 'cancel')).rejects.toThrow(/exceeds/);
  });
});
