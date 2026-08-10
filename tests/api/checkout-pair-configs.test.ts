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

// Eligibility/premium lookup: table-driven stub — .from('product_metadata')
// maps variant id -> subscription_tier ('included' | 'premium'); a variant id
// absent from the table simulates "no row" (ineligible). metadataError, when
// set, simulates a failed query (data: null, error: {...}) so the fail-closed
// path can be exercised.
let metadataRows: Record<number, string> = {};
let metadataError: { message: string } | null = null;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: (_col: string, ids: number[]) => Promise.resolve(
          metadataError
            ? { data: null, error: metadataError }
            : {
                data: ids
                  .filter((id) => id in metadataRows)
                  .map((id) => ({ shopify_variant_id: id, subscription_tier: metadataRows[id] })),
                error: null,
              },
        ),
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
  metadataRows = {};
  metadataError = null;
});

describe('/checkout with pair configs', () => {
  it('mints _pair_N attributes and LENSUP lines for chargeable options', async () => {
    metadataRows = { 501: 'included', 502: 'included' };
    const res = await post([membershipLine([
      { v: 501, h: 'dusk-wayfarer', l: 'single_vision', u: [], t: 'none' },
      { v: 502, h: 'marina-oval-sun', l: 'non_rx', u: ['photochromic'], t: 'grey' },
    ])]);
    expect(res.status).toBe(200);
    const cartLines = createCart.mock.calls[0][0];
    expect(cartLines).toHaveLength(3); // base + photochromic + grey (pair 1 has no chargeable options)
    const mLine = cartLines[0];
    expect(mLine.attributes.find((a: { key: string }) => a.key === '_pair_1')).toBeTruthy();
    expect(mLine.attributes.find((a: { key: string }) => a.key === '_pair_2')).toBeTruthy();
    const addonIds = cartLines.slice(1).map((l: { merchandiseId: string }) => l.merchandiseId);
    expect(addonIds).toContain('gid://shopify/ProductVariant/85'); // photochromic
    expect(addonIds).toContain('gid://shopify/ProductVariant/40'); // grey tint
  });

  it('adds a SURCH-PREMIUM line for premium pairs', async () => {
    metadataRows = { 501: 'premium' };
    const res = await post([membershipLine([{ v: 501, h: 'axiom-browline', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(200);
    const cartLines = createCart.mock.calls[0][0];
    expect(cartLines).toHaveLength(2); // base + SURCH-PREMIUM
    const addonIds = cartLines.slice(1).map((l: { merchandiseId: string }) => l.merchandiseId);
    expect(addonIds).toContain('gid://shopify/ProductVariant/777');
    expect(cartLines[1].attributes).toEqual(
      expect.arrayContaining([{ key: '_pair_index', value: '1' }]),
    );
  });

  it('stamps a distinct _pair_index on each charge line so identical-option pairs are never merged', async () => {
    metadataRows = { 501: 'included', 502: 'included' };
    const res = await post([membershipLine([
      { v: 501, h: 'a', l: 'non_rx', u: ['photochromic'], t: 'none' },
      { v: 502, h: 'b', l: 'non_rx', u: ['photochromic'], t: 'none' },
    ])]);
    expect(res.status).toBe(200);
    const cartLines = createCart.mock.calls[0][0];
    expect(cartLines).toHaveLength(3); // base + 2x photochromic (one per pair)
    const photoLines = cartLines
      .slice(1)
      .filter((l: { merchandiseId: string }) => l.merchandiseId === 'gid://shopify/ProductVariant/85');
    expect(photoLines).toHaveLength(2);
    const pairIndexes = photoLines
      .map((l: { attributes: Array<{ key: string; value: string }> }) => l.attributes.find((a) => a.key === '_pair_index')?.value)
      .sort();
    expect(pairIndexes).toEqual(['1', '2']);
  });

  it('mints _pair_N on the membership base line even when an add-on line is pushed in between', async () => {
    metadataRows = { 501: 'included' };
    const line = {
      ...membershipLine([{ v: 501, h: 'a', l: 'non_rx', u: [], t: 'none' }]),
      // Top-level lensConfig carries a paid tint of its own, so the existing
      // lens-upgrade loop pushes an add-on line for THIS line before the
      // pair-config branch runs — the last-pushed line is that add-on, not
      // the membership base line.
      lensConfig: { lensType: 'non_rx', coatings: [], tint: 'grey' },
    };
    const res = await post([line]);
    expect(res.status).toBe(200);
    const cartLines = createCart.mock.calls[0][0];
    expect(cartLines).toHaveLength(2); // base + top-level grey-tint add-on (pair itself has no chargeable options)
    const membershipCartLine = cartLines.find((l: { merchandiseId: string }) => l.merchandiseId === line.variantId);
    expect(membershipCartLine).toBeTruthy();
    expect(membershipCartLine.attributes.find((a: { key: string }) => a.key === '_pair_1')).toBeTruthy();
  });

  it('pairConfigs: [] behaves exactly like no pair configs', async () => {
    const res = await post([membershipLine([])]);
    expect(res.status).toBe(200);
    expect(createCart.mock.calls[0][0]).toHaveLength(1);
  });

  it('zero-config membership purchase still works unchanged', async () => {
    const res = await post([membershipLine(undefined)]);
    expect(res.status).toBe(200);
    expect(createCart.mock.calls[0][0]).toHaveLength(1);
  });

  it('409s when configs exceed the tier pair count', async () => {
    const res = await post([membershipLine(
      [{ v: 1, h: 'a', l: 'non_rx', u: [], t: 'none' }, { v: 2, h: 'b', l: 'non_rx', u: [], t: 'none' }],
      'gid://shopify/ProductVariant/1001', // Solo — 1 pair
    )]);
    expect(res.status).toBe(409);
    expect(createCart).not.toHaveBeenCalled();
  });

  it('409s a premium pair when surcharge pricing is unavailable (fail closed)', async () => {
    metadataRows = { 501: 'premium' };
    getFrameSurchargePricing.mockResolvedValue(null);
    const res = await post([membershipLine([{ v: 501, h: 'axiom-browline', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(409);
    expect(createCart).not.toHaveBeenCalled();
  });

  it('409s when membership pricing cannot resolve the tier', async () => {
    getMembershipPricing.mockResolvedValue(null);
    const res = await post([membershipLine([{ v: 501, h: 'x', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(409);
    expect(createCart).not.toHaveBeenCalled();
  });

  it('409s pairConfigs on a non-membership line', async () => {
    const res = await post([{ ...membershipLine([{ v: 1, h: 'a', l: 'non_rx', u: [], t: 'none' }]), productHandle: 'dusk-wayfarer' }]);
    expect(res.status).toBe(409);
    expect(createCart).not.toHaveBeenCalled();
  });

  it('409s when a configured membership line has quantity other than 1', async () => {
    metadataRows = { 501: 'included' };
    const line = { ...membershipLine([{ v: 501, h: 'a', l: 'non_rx', u: [], t: 'none' }]), quantity: 2 };
    const res = await post([line]);
    expect(res.status).toBe(409);
    expect(createCart).not.toHaveBeenCalled();
  });

  it('409s fail-closed when the product_metadata lookup errors (must never default to free)', async () => {
    metadataError = { message: 'connection reset' };
    const res = await post([membershipLine([{ v: 501, h: 'a', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(409);
    expect(createCart).not.toHaveBeenCalled();
  });

  it('409s when a chosen frame has no product_metadata row (not a covered membership SKU)', async () => {
    metadataRows = {}; // 501 absent
    const res = await post([membershipLine([{ v: 501, h: 'a', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(409);
    expect(createCart).not.toHaveBeenCalled();
  });
});
