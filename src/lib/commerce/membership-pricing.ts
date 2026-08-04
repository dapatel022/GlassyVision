import { cache } from 'react';
import { storefrontFetch } from './shopify-storefront';

/**
 * Live pricing for the three prepaid membership tiers. Prices are OWNED by the
 * Shopify product `membership` (SKU-keyed SUB-* variants, created by
 * scripts/setup-membership.js) — never hardcoded here.
 *
 * FAIL CLOSED: null (product missing, any tier SKU absent, API error) means
 * the /membership page must disable its CTAs. A partial tier table would
 * misprice the comparison, so 2-of-3 SKUs is also null.
 */

export const MEMBERSHIP_HANDLE = 'membership';

const TIER_BY_SKU: Record<string, { tier: 'solo' | 'duo' | 'trio'; pairs: number }> = {
  'SUB-1PAIR': { tier: 'solo', pairs: 1 },
  'SUB-2PAIR': { tier: 'duo', pairs: 2 },
  'SUB-3PAIR': { tier: 'trio', pairs: 3 },
};
const TIER_ORDER: Array<'solo' | 'duo' | 'trio'> = ['solo', 'duo', 'trio'];

export interface MembershipTierPrice {
  sku: string;
  tier: 'solo' | 'duo' | 'trio';
  pairs: number;
  variantId: string;
  price: number;
  perPair: number;
  currencyCode: string;
}

export type MembershipPricing = MembershipTierPrice[] | null;

const MEMBERSHIP_QUERY = /* GraphQL */ `
  query MembershipTiers($handle: String!) {
    productByHandle(handle: $handle) {
      variants(first: 10) {
        edges {
          node {
            id
            sku
            price {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

interface MembershipResponse {
  productByHandle: {
    variants: {
      edges: Array<{ node: { id: string; sku: string | null; price: { amount: string; currencyCode: string } } }>;
    };
  } | null;
}

export const getMembershipPricing = cache(async (): Promise<MembershipPricing> => {
  try {
    const data = await storefrontFetch<MembershipResponse>(MEMBERSHIP_QUERY, { handle: MEMBERSHIP_HANDLE });
    if (!data.productByHandle) {
      console.error('[membership-pricing] membership product unavailable — tiers fail closed. Run scripts/setup-membership.js and publish to the headless channel.');
      return null;
    }
    const bySku = new Map<string, { id: string; price: number; currencyCode: string }>();
    for (const { node } of data.productByHandle.variants.edges) {
      if (node.sku && TIER_BY_SKU[node.sku]) {
        bySku.set(node.sku, { id: node.id, price: Number(node.price.amount), currencyCode: node.price.currencyCode });
      }
    }
    const tiers: MembershipTierPrice[] = [];
    for (const tier of TIER_ORDER) {
      const sku = Object.keys(TIER_BY_SKU).find((s) => TIER_BY_SKU[s].tier === tier)!;
      const v = bySku.get(sku);
      if (!v) {
        console.error(`[membership-pricing] tier SKU ${sku} missing — tiers fail closed (partial table would misprice the comparison)`);
        return null;
      }
      tiers.push({
        sku,
        tier,
        pairs: TIER_BY_SKU[sku].pairs,
        variantId: v.id,
        price: v.price,
        perPair: Math.round(v.price / TIER_BY_SKU[sku].pairs),
        currencyCode: v.currencyCode,
      });
    }
    return tiers;
  } catch (err) {
    console.error('[membership-pricing] Storefront fetch failed — tiers fail closed', err);
    return null;
  }
});
