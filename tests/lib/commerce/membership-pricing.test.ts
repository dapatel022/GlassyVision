import { describe, it, expect, vi, beforeEach } from 'vitest';

const storefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, storefrontFetch: (...a: unknown[]) => storefrontFetch(...a) };
});

function shopifyVariants(nodes: Array<{ sku: string; price: string }>) {
  return {
    productByHandle: {
      variants: {
        edges: nodes.map((n, i) => ({
          node: { id: `gid://shopify/ProductVariant/${i + 1}`, sku: n.sku, price: { amount: n.price, currencyCode: 'USD' } },
        })),
      },
    },
  };
}

const ALL_TIERS = [
  { sku: 'SUB-1PAIR', price: '89.00' },
  { sku: 'SUB-2PAIR', price: '149.00' },
  { sku: 'SUB-3PAIR', price: '189.00' },
];

beforeEach(() => {
  vi.resetModules();
  storefrontFetch.mockReset();
});

describe('getMembershipPricing', () => {
  it('returns the 3 tiers ordered solo→trio with per-pair math', async () => {
    storefrontFetch.mockResolvedValueOnce(shopifyVariants(ALL_TIERS));
    const { getMembershipPricing } = await import('@/lib/commerce/membership-pricing');
    const pricing = await getMembershipPricing();

    expect(pricing).not.toBeNull();
    expect(pricing!.map((t) => t.tier)).toEqual(['solo', 'duo', 'trio']);
    expect(pricing!.map((t) => t.pairs)).toEqual([1, 2, 3]);
    expect(pricing!.map((t) => t.perPair)).toEqual([89, 75, 63]);
    expect(pricing![1]).toMatchObject({ sku: 'SUB-2PAIR', price: 149, currencyCode: 'USD' });
  });

  it('returns null when the membership product is missing (fail closed)', async () => {
    storefrontFetch.mockResolvedValueOnce({ productByHandle: null });
    const { getMembershipPricing } = await import('@/lib/commerce/membership-pricing');
    expect(await getMembershipPricing()).toBeNull();
  });

  it('returns null when any tier SKU is missing — a partial table must not render', async () => {
    storefrontFetch.mockResolvedValueOnce(shopifyVariants(ALL_TIERS.slice(0, 2)));
    const { getMembershipPricing } = await import('@/lib/commerce/membership-pricing');
    expect(await getMembershipPricing()).toBeNull();
  });

  it('returns null when the Storefront API throws (fail closed)', async () => {
    storefrontFetch.mockRejectedValueOnce(new Error('network'));
    const { getMembershipPricing } = await import('@/lib/commerce/membership-pricing');
    expect(await getMembershipPricing()).toBeNull();
  });
});
