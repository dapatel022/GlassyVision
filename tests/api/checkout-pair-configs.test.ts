import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const createCart = vi.fn();
vi.mock('@/lib/commerce/shopify', () => ({ createCart: (...a: unknown[]) => createCart(...a) }));

const getLensUpgradePricing = vi.fn();
vi.mock('@/lib/commerce/lens-pricing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getLensUpgradePricing: () => getLensUpgradePricing() };
});

const getFrameSurchargePricing = vi.fn();
vi.mock('@/lib/commerce/frame-surcharge-pricing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getFrameSurchargePricing: () => getFrameSurchargePricing() };
});

const getMembershipPricing = vi.fn();
vi.mock('@/lib/commerce/membership-pricing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getMembershipPricing: () => getMembershipPricing() };
});

// Premium lookup: table-driven stub — .from('product_metadata') → premium rows for these variant ids
let premiumVariantIds: number[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: (_col: string, ids: number[]) => Promise.resolve({
          data: ids.filter((id) => premiumVariantIds.includes(id)).map((id) => ({ shopify_variant_id: id, subscription_tier: 'premium' })),
          error: null,
        }),
      }),
    }),
  }),
}));

const TIER_PRICING = [
  { sku: 'SUB-1PAIR', tier: 'solo', pairs: 1, variantId: 'gid://shopify/ProductVariant/1001', price: 109, perPair: 109, currencyCode: 'USD' },
  { sku: 'SUB-3PAIR', tier: 'trio', pairs: 3, variantId: 'gid://shopify/ProductVariant/1003', price: 219, perPair: 73, currencyCode: 'USD' },
];
const LENS_PRICING = {
  photochromic: { optionId: 'photochromic', variantId: 'gid://shopify/ProductVariant/85', price: 85, currencyCode: 'USD' },
  grey: { optionId: 'grey', variantId: 'gid://shopify/ProductVariant/40', price: 40, currencyCode: 'USD' },
};

function membershipLine(pairConfigs: unknown, variantId = 'gid://shopify/ProductVariant/1003') {
  return {
    productId: 'membership', variantId, productHandle: 'membership',
    title: 'GlassyVision Membership — Trio', image: null, unitPrice: 219, quantity: 1,
    lensConfig: { lensType: 'non_rx', coatings: [], tint: 'none' },
    pairConfigs,
  };
}

async function post(lines: unknown[]) {
  const { POST } = await import('@/app/checkout/route');
  return POST(new NextRequest('http://local/checkout', {
    method: 'POST', body: JSON.stringify({ lines }), headers: { 'Content-Type': 'application/json' },
  }));
}

beforeEach(() => {
  vi.resetModules();
  createCart.mockReset().mockResolvedValue({ id: 'cart1', checkoutUrl: 'https://x/checkout' });
  getLensUpgradePricing.mockReset().mockResolvedValue(LENS_PRICING);
  getFrameSurchargePricing.mockReset().mockResolvedValue({ variantId: 'gid://shopify/ProductVariant/777', price: 40, currencyCode: 'USD' });
  getMembershipPricing.mockReset().mockResolvedValue(TIER_PRICING);
  premiumVariantIds = [];
});

describe('/checkout with pair configs', () => {
  it('mints _pair_N attributes and LENSUP lines for chargeable options', async () => {
    const res = await post([membershipLine([
      { v: 501, h: 'dusk-wayfarer', l: 'single_vision', u: [], t: 'none' },
      { v: 502, h: 'marina-oval-sun', l: 'non_rx', u: ['photochromic'], t: 'grey' },
    ])]);
    expect(res.status).toBe(200);
    const cartLines = createCart.mock.calls[0][0];
    const mLine = cartLines[0];
    expect(mLine.attributes.find((a: { key: string }) => a.key === '_pair_1')).toBeTruthy();
    expect(mLine.attributes.find((a: { key: string }) => a.key === '_pair_2')).toBeTruthy();
    const addonIds = cartLines.slice(1).map((l: { merchandiseId: string }) => l.merchandiseId);
    expect(addonIds).toContain('gid://shopify/ProductVariant/85'); // photochromic
    expect(addonIds).toContain('gid://shopify/ProductVariant/40'); // grey tint
  });

  it('adds a SURCH-PREMIUM line for premium pairs', async () => {
    premiumVariantIds = [501];
    const res = await post([membershipLine([{ v: 501, h: 'axiom-browline', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(200);
    const addonIds = createCart.mock.calls[0][0].slice(1).map((l: { merchandiseId: string }) => l.merchandiseId);
    expect(addonIds).toContain('gid://shopify/ProductVariant/777');
  });

  it('409s when configs exceed the tier pair count', async () => {
    const res = await post([membershipLine(
      [{ v: 1, h: 'a', l: 'non_rx', u: [], t: 'none' }, { v: 2, h: 'b', l: 'non_rx', u: [], t: 'none' }],
      'gid://shopify/ProductVariant/1001', // Solo — 1 pair
    )]);
    expect(res.status).toBe(409);
  });

  it('409s a premium pair when surcharge pricing is unavailable (fail closed)', async () => {
    premiumVariantIds = [501];
    getFrameSurchargePricing.mockResolvedValue(null);
    const res = await post([membershipLine([{ v: 501, h: 'axiom-browline', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(409);
  });

  it('409s when membership pricing cannot resolve the tier', async () => {
    getMembershipPricing.mockResolvedValue(null);
    const res = await post([membershipLine([{ v: 501, h: 'x', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(409);
  });

  it('409s pairConfigs on a non-membership line', async () => {
    const res = await post([{ ...membershipLine([{ v: 1, h: 'a', l: 'non_rx', u: [], t: 'none' }]), productHandle: 'dusk-wayfarer' }]);
    expect(res.status).toBe(409);
  });

  it('zero-config membership purchase still works unchanged', async () => {
    const res = await post([membershipLine(undefined)]);
    expect(res.status).toBe(200);
    expect(createCart.mock.calls[0][0]).toHaveLength(1);
  });
});
