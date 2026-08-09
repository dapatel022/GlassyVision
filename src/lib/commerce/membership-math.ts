import { cache } from 'react';
import { storefrontFetch } from './shopify-storefront';
import { getMembershipPricing } from './membership-pricing';
import {
  buildMembershipMath,
  MATH_EXCLUDED_HANDLES,
  type MembershipMath,
} from './membership-math-core';

export type { MembershipMath, TierMath } from './membership-math-core';
export { pdpMathLine, matchTierForCart, cartFrameSummary } from './membership-math-core';

const FRAME_PRICES_QUERY = /* GraphQL */ `
  query FramePrices($first: Int = 100) {
    products(first: $first) {
      edges {
        node {
          handle
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

interface FramePricesResponse {
  products: {
    edges: Array<{
      node: { handle: string; priceRange: { minVariantPrice: { amount: string; currencyCode: string } } };
    }>;
  };
}

/**
 * All membership savings figures, from live Shopify prices only.
 * FAIL CLOSED: null (tier pricing unavailable, <3 priced frames, API error)
 * → every consumer renders nothing. Deliberately NO mock fallback — a
 * fabricated savings number is worse than no savings module.
 */
export const getMembershipMath = cache(async (): Promise<MembershipMath | null> => {
  try {
    const [pricing, frames] = await Promise.all([
      getMembershipPricing(),
      storefrontFetch<FramePricesResponse>(FRAME_PRICES_QUERY, { first: 100 }),
    ]);
    const framePrices = frames.products.edges
      .filter(({ node }) => !(MATH_EXCLUDED_HANDLES as readonly string[]).includes(node.handle))
      .map(({ node }) => Number(node.priceRange.minVariantPrice.amount));
    const math = buildMembershipMath(pricing, framePrices);
    if (!math) {
      console.error('[membership-math] inputs unavailable — savings modules fail closed');
    }
    return math;
  } catch (err) {
    console.error('[membership-math] Storefront fetch failed — savings modules fail closed', err);
    return null;
  }
});
