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

beforeEach(() => {
  vi.resetModules();
  storefrontFetch.mockReset();
});

describe('skuToOptionId', () => {
  it('maps LENSUP SKUs to option ids', async () => {
    const { skuToOptionId } = await import('@/lib/commerce/lens-pricing');
    expect(skuToOptionId('LENSUP-SINGLE_VISION')).toBe('single_vision');
    expect(skuToOptionId('LENSUP-PROGRESSIVE')).toBe('progressive');
    expect(skuToOptionId('LENSUP-AR')).toBe('ar');
    expect(skuToOptionId('LENSUP-TINT_GREY')).toBe('grey');
    expect(skuToOptionId('LENSUP-TINT_AMBER')).toBe('amber');
    expect(skuToOptionId('SOMETHING-ELSE')).toBeNull();
  });
});

describe('getLensUpgradePricing', () => {
  it('builds an optionId-keyed map from variant SKUs and prices', async () => {
    storefrontFetch.mockResolvedValueOnce(shopifyVariants([
      { sku: 'LENSUP-PROGRESSIVE', price: '150.00' },
      { sku: 'LENSUP-AR', price: '30.00' },
      { sku: 'LENSUP-TINT_GREY', price: '40.00' },
    ]));

    const { getLensUpgradePricing } = await import('@/lib/commerce/lens-pricing');
    const map = await getLensUpgradePricing();

    expect(map).not.toBeNull();
    expect(map!.progressive).toMatchObject({ price: 150, currencyCode: 'USD' });
    expect(map!.ar.price).toBe(30);
    expect(map!.grey.variantId).toBe('gid://shopify/ProductVariant/3');
  });

  it('returns null when the lens-upgrades product does not exist (fail closed)', async () => {
    storefrontFetch.mockResolvedValueOnce({ productByHandle: null });
    const { getLensUpgradePricing } = await import('@/lib/commerce/lens-pricing');
    expect(await getLensUpgradePricing()).toBeNull();
  });

  it('returns null when the Storefront API throws (fail closed)', async () => {
    storefrontFetch.mockRejectedValueOnce(new Error('network'));
    const { getLensUpgradePricing } = await import('@/lib/commerce/lens-pricing');
    expect(await getLensUpgradePricing()).toBeNull();
  });
});
