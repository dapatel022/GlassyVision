import { describe, it, expect, vi, beforeEach } from 'vitest';

// getProducts is the existing catalog fetch (@/lib/commerce/shopify). Mocked
// so tests never hit the network; only getProducts is stubbed, everything
// else in the module keeps its real export shape via importOriginal.
const getProducts = vi.fn();
vi.mock('@/lib/commerce/shopify', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getProducts: (...a: unknown[]) => getProducts(...a) };
});

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

// Same table-driven admin-client stub style as tests/api/checkout-pair-configs.test.ts:
// .from('product_metadata').select(...).in('shopify_variant_id', ids) resolves
// from `metadataRows` (variant id -> { subscription_tier, is_rx_capable }); a
// variant id absent from the table simulates "no row on file". metadataError,
// when set, simulates a failed query (data: null, error: {...}).
let metadataRows: Record<number, { subscription_tier: string; is_rx_capable: boolean }> = {};
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
                  .map((id) => ({ shopify_variant_id: id, ...metadataRows[id] })),
                error: null,
              },
        ),
      }),
    }),
  }),
}));

const TIER_PRICING = [
  { sku: 'SUB-1PAIR', tier: 'solo', pairs: 1, variantId: 'gid://shopify/ProductVariant/1001', price: 109, perPair: 109, currencyCode: 'USD' },
];
const LENS_PRICING = {
  photochromic: { optionId: 'photochromic', variantId: 'gid://shopify/ProductVariant/85', price: 85, currencyCode: 'USD' },
};
const SURCHARGE = { variantId: 'gid://shopify/ProductVariant/777', price: 40, currencyCode: 'USD' };

function product(overrides: Partial<{
  handle: string;
  title: string;
  variantGid: string | null;
  price: string;
  imageUrl: string | null;
}> = {}) {
  const {
    handle = 'dusk-wayfarer',
    title = 'Dusk Wayfarer',
    variantGid = 'gid://shopify/ProductVariant/501',
    price = '129.00',
    imageUrl = 'https://cdn.example.com/dusk.jpg',
  } = overrides;
  return {
    id: 'gid://shopify/Product/1',
    handle,
    title,
    description: '',
    price,
    currencyCode: 'USD',
    images: imageUrl ? [{ url: imageUrl, altText: null, width: 800, height: 600 }] : [],
    variants: variantGid ? [{ id: variantGid, title: 'Default', sku: null, price, availableForSale: true, selectedOptions: [] }] : [],
  };
}

beforeEach(() => {
  vi.resetModules();
  getProducts.mockReset().mockResolvedValue([]);
  getLensUpgradePricing.mockReset().mockResolvedValue(LENS_PRICING);
  getFrameSurchargePricing.mockReset().mockResolvedValue(SURCHARGE);
  getMembershipPricing.mockReset().mockResolvedValue(TIER_PRICING);
  metadataRows = {};
  metadataError = null;
});

describe('getBuilderData', () => {
  it('M5: requests the catalog with first=250, not the getProducts default of 50, so a growing catalog never silently drops frames', async () => {
    const { getBuilderData } = await import('@/features/subscriptions/lib/builder-data');
    await getBuilderData();
    expect(getProducts).toHaveBeenCalledWith(250);
  });

  it('assembles frames with premium and rxCapable flags on the happy path', async () => {
    getProducts.mockResolvedValue([
      product({ handle: 'dusk-wayfarer', variantGid: 'gid://shopify/ProductVariant/501' }),
      product({ handle: 'axiom-browline', variantGid: 'gid://shopify/ProductVariant/502', title: 'Axiom Browline' }),
    ]);
    metadataRows = {
      501: { subscription_tier: 'included', is_rx_capable: true },
      502: { subscription_tier: 'premium', is_rx_capable: false },
    };
    const { getBuilderData } = await import('@/features/subscriptions/lib/builder-data');
    const data = await getBuilderData();

    expect(data.tiers).toEqual(TIER_PRICING);
    expect(data.lensPricing).toEqual(LENS_PRICING);
    expect(data.surcharge).toEqual(SURCHARGE);
    expect(data.frames).toHaveLength(2);

    const dusk = data.frames.find((f) => f.handle === 'dusk-wayfarer');
    expect(dusk).toEqual({
      handle: 'dusk-wayfarer',
      title: 'Dusk Wayfarer',
      image: 'https://cdn.example.com/dusk.jpg',
      variantId: 501,
      price: 129,
      premium: false,
      rxCapable: true,
    });

    const axiom = data.frames.find((f) => f.handle === 'axiom-browline');
    expect(axiom).toMatchObject({ variantId: 502, premium: true, rxCapable: false });
  });

  it('excludes membership, lens-upgrades, and frame-surcharges handles', async () => {
    getProducts.mockResolvedValue([
      product({ handle: 'membership', variantGid: 'gid://shopify/ProductVariant/1001' }),
      product({ handle: 'lens-upgrades', variantGid: 'gid://shopify/ProductVariant/85' }),
      product({ handle: 'frame-surcharges', variantGid: 'gid://shopify/ProductVariant/777' }),
      product({ handle: 'dusk-wayfarer', variantGid: 'gid://shopify/ProductVariant/501' }),
    ]);
    metadataRows = { 501: { subscription_tier: 'included', is_rx_capable: true } };
    const { getBuilderData } = await import('@/features/subscriptions/lib/builder-data');
    const data = await getBuilderData();

    expect(data.frames.map((f) => f.handle)).toEqual(['dusk-wayfarer']);
  });

  it('drops frames whose product_metadata tier is missing or excluded', async () => {
    getProducts.mockResolvedValue([
      product({ handle: 'no-metadata-row', variantGid: 'gid://shopify/ProductVariant/601' }),
      product({ handle: 'excluded-tier', variantGid: 'gid://shopify/ProductVariant/602' }),
      product({ handle: 'included-tier', variantGid: 'gid://shopify/ProductVariant/603' }),
    ]);
    metadataRows = {
      // 601 absent entirely — no row on file.
      602: { subscription_tier: 'excluded', is_rx_capable: true },
      603: { subscription_tier: 'included', is_rx_capable: true },
    };
    const { getBuilderData } = await import('@/features/subscriptions/lib/builder-data');
    const data = await getBuilderData();

    expect(data.frames.map((f) => f.handle)).toEqual(['included-tier']);
  });

  it('drops a product whose variant id is not a parseable number', async () => {
    getProducts.mockResolvedValue([
      product({ handle: 'bad-variant', variantGid: 'gid://shopify/ProductVariant/not-a-number' }),
      product({ handle: 'no-variants', variantGid: null }),
      product({ handle: 'dusk-wayfarer', variantGid: 'gid://shopify/ProductVariant/501' }),
    ]);
    metadataRows = { 501: { subscription_tier: 'included', is_rx_capable: true } };
    const { getBuilderData } = await import('@/features/subscriptions/lib/builder-data');
    const data = await getBuilderData();

    expect(data.frames.map((f) => f.handle)).toEqual(['dusk-wayfarer']);
  });

  it('degrades surcharge to null on fetch failure while frames still return', async () => {
    getProducts.mockResolvedValue([product({ handle: 'dusk-wayfarer', variantGid: 'gid://shopify/ProductVariant/501' })]);
    metadataRows = { 501: { subscription_tier: 'included', is_rx_capable: true } };
    getFrameSurchargePricing.mockResolvedValue(null);
    const { getBuilderData } = await import('@/features/subscriptions/lib/builder-data');
    const data = await getBuilderData();

    expect(data.surcharge).toBeNull();
    expect(data.frames).toHaveLength(1);
    expect(data.frames[0].handle).toBe('dusk-wayfarer');
  });

  it('propagates a null tiers result unchanged (fail-closed builder block)', async () => {
    getProducts.mockResolvedValue([product({ handle: 'dusk-wayfarer', variantGid: 'gid://shopify/ProductVariant/501' })]);
    metadataRows = { 501: { subscription_tier: 'included', is_rx_capable: true } };
    getMembershipPricing.mockResolvedValue(null);
    const { getBuilderData } = await import('@/features/subscriptions/lib/builder-data');
    const data = await getBuilderData();

    expect(data.tiers).toBeNull();
    expect(data.frames).toHaveLength(1);
  });
});
