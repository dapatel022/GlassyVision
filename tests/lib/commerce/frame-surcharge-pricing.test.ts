import { describe, it, expect, vi, beforeEach } from 'vitest';

const storefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, storefrontFetch: (...a: unknown[]) => storefrontFetch(...a) };
});

const PRODUCT = {
  productByHandle: {
    variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/777', sku: 'SURCH-PREMIUM', price: { amount: '40.00', currencyCode: 'USD' } } }] },
  },
};

beforeEach(() => { vi.resetModules(); storefrontFetch.mockReset(); });

describe('getFrameSurchargePricing', () => {
  it('returns the live premium surcharge', async () => {
    storefrontFetch.mockResolvedValueOnce(PRODUCT);
    const { getFrameSurchargePricing } = await import('@/lib/commerce/frame-surcharge-pricing');
    expect(await getFrameSurchargePricing()).toEqual({ variantId: 'gid://shopify/ProductVariant/777', price: 40, currencyCode: 'USD' });
  });
  it('is null when the product is missing (fail closed)', async () => {
    storefrontFetch.mockResolvedValueOnce({ productByHandle: null });
    const { getFrameSurchargePricing } = await import('@/lib/commerce/frame-surcharge-pricing');
    expect(await getFrameSurchargePricing()).toBeNull();
  });
  it('is null when the SURCH-PREMIUM SKU is absent', async () => {
    storefrontFetch.mockResolvedValueOnce({ productByHandle: { variants: { edges: [{ node: { id: 'gid://1', sku: 'OTHER', price: { amount: '40.00', currencyCode: 'USD' } } }] } } });
    const { getFrameSurchargePricing } = await import('@/lib/commerce/frame-surcharge-pricing');
    expect(await getFrameSurchargePricing()).toBeNull();
  });
  it('is null when the fetch throws (fail closed)', async () => {
    storefrontFetch.mockRejectedValueOnce(new Error('network'));
    const { getFrameSurchargePricing } = await import('@/lib/commerce/frame-surcharge-pricing');
    expect(await getFrameSurchargePricing()).toBeNull();
  });
});
