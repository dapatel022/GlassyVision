import { describe, it, expect, vi, beforeEach } from 'vitest';

const adminFetch = vi.fn();
vi.mock('@/lib/commerce/admin-fetch', () => ({ adminFetch: (...a: unknown[]) => adminFetch(...a) }));
import { createRefund, getCapturedAmount } from '@/lib/commerce/shopify-admin';

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

describe('getCapturedAmount (original captured base)', () => {
  beforeEach(() => adminFetch.mockReset());

  it('sums success capture/sale transactions and ignores refunds', async () => {
    adminFetch.mockResolvedValueOnce({
      transactions: [
        { kind: 'sale', status: 'success', amount: '100.00' },
        { kind: 'capture', status: 'success', amount: '50.00' },
        { kind: 'refund', status: 'success', amount: '30.00' }, // prior partial refund — ignored
        { kind: 'capture', status: 'failure', amount: '999.00' }, // not success — ignored
      ],
    });
    // Captured base stays the ORIGINAL 150, not 150-30=120.
    expect(await getCapturedAmount(123, 'USD')).toBe(150);
    expect(adminFetch.mock.calls[0][0]).toBe('orders/123/transactions.json');
  });

  it('rounds the summed captured amount to 2 decimals', async () => {
    adminFetch.mockResolvedValueOnce({
      transactions: [
        { kind: 'sale', status: 'success', amount: '33.335' },
        { kind: 'capture', status: 'success', amount: '0.005' },
      ],
    });
    expect(await getCapturedAmount(123, 'USD')).toBe(33.34);
  });

  it('falls back to order total_price when there are no capture/sale transactions', async () => {
    adminFetch
      .mockResolvedValueOnce({ transactions: [{ kind: 'authorization', status: 'success', amount: '75.00' }] })
      .mockResolvedValueOnce({ order: { total_price: '75.00' } });
    expect(await getCapturedAmount(123, 'USD')).toBe(75);
    expect(adminFetch.mock.calls[1][0]).toContain('orders/123.json');
    expect(adminFetch.mock.calls[1][0]).toContain('fields=total_price');
  });
});
