import { describe, it, expect, vi, beforeEach } from 'vitest';

const storefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, storefrontFetch: (...a: unknown[]) => storefrontFetch(...a) };
});

const MEMBERSHIP_VARIANTS = {
  productByHandle: {
    variants: {
      edges: [
        { node: { id: 'gid://1', sku: 'SUB-1PAIR', price: { amount: '89.00', currencyCode: 'USD' } } },
        { node: { id: 'gid://2', sku: 'SUB-2PAIR', price: { amount: '149.00', currencyCode: 'USD' } } },
        { node: { id: 'gid://3', sku: 'SUB-3PAIR', price: { amount: '189.00', currencyCode: 'USD' } } },
      ],
    },
  },
};

function framePrices(entries: Array<{ handle: string; amount: string }>) {
  return {
    products: {
      edges: entries.map(({ handle, amount }) => ({
        node: { handle, priceRange: { minVariantPrice: { amount, currencyCode: 'USD' } } },
      })),
    },
  };
}

const CATALOG = framePrices([
  { handle: 'dusk-wayfarer', amount: '150.00' },
  { handle: 'halcyon-aviator', amount: '250.00' },
  { handle: 'axiom-browline', amount: '350.00' },
  { handle: 'membership', amount: '89.00' },        // must be excluded
  { handle: 'lens-upgrades', amount: '25.00' },     // must be excluded
]);

beforeEach(() => {
  vi.resetModules();
  storefrontFetch.mockReset();
});

// getMembershipMath issues 2 storefront calls (membership variants + frame
// prices) in Promise.all order; route by query content, not call order.
function routeFetches() {
  storefrontFetch.mockImplementation((query: string) =>
    Promise.resolve(query.includes('FramePrices') ? CATALOG : MEMBERSHIP_VARIANTS),
  );
}

describe('getMembershipMath', () => {
  it('computes math from live tiers + median frame price, excluding non-frames', async () => {
    routeFetches();
    const { getMembershipMath } = await import('@/lib/commerce/membership-math');
    const math = await getMembershipMath();
    expect(math).not.toBeNull();
    expect(math!.representativeFramePrice).toBe(250); // membership/lens-upgrades excluded
    expect(math!.bestPerPair).toBe(63);
    expect(math!.tiers).toHaveLength(3);
  });

  it('is null when membership pricing is unavailable (fail closed)', async () => {
    storefrontFetch.mockImplementation((query: string) =>
      Promise.resolve(query.includes('FramePrices') ? CATALOG : { productByHandle: null }),
    );
    const { getMembershipMath } = await import('@/lib/commerce/membership-math');
    expect(await getMembershipMath()).toBeNull();
  });

  it('is null when the catalog fetch throws (fail closed, no mock fallback)', async () => {
    storefrontFetch.mockImplementation((query: string) =>
      query.includes('FramePrices')
        ? Promise.reject(new Error('network'))
        : Promise.resolve(MEMBERSHIP_VARIANTS),
    );
    const { getMembershipMath } = await import('@/lib/commerce/membership-math');
    expect(await getMembershipMath()).toBeNull();
  });

  it('is null with fewer than 3 priced frames', async () => {
    storefrontFetch.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('FramePrices')
          ? framePrices([
              { handle: 'dusk-wayfarer', amount: '150.00' },
              { handle: 'halcyon-aviator', amount: '250.00' },
            ])
          : MEMBERSHIP_VARIANTS,
      ),
    );
    const { getMembershipMath } = await import('@/lib/commerce/membership-math');
    expect(await getMembershipMath()).toBeNull();
  });
});
