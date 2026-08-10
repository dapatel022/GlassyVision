import { cache } from 'react';
import { storefrontFetch } from './shopify-storefront';

/**
 * Live premium-frame surcharge price, owned by the hidden Shopify product
 * `frame-surcharges` (SKU SURCH-PREMIUM, created by
 * scripts/setup-frame-surcharges.js). FAIL CLOSED: null means premium frames
 * are unselectable in the builder and /checkout 409s a premium pair.
 */

export const FRAME_SURCHARGES_HANDLE = 'frame-surcharges';
export const SURCH_PREMIUM_SKU = 'SURCH-PREMIUM';

export interface FrameSurchargePrice {
  variantId: string;
  price: number;
  currencyCode: string;
}

const QUERY = /* GraphQL */ `
  query FrameSurcharges($handle: String!) {
    productByHandle(handle: $handle) {
      variants(first: 5) {
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

interface Response {
  productByHandle: {
    variants: { edges: Array<{ node: { id: string; sku: string | null; price: { amount: string; currencyCode: string } } }> };
  } | null;
}

export const getFrameSurchargePricing = cache(async (): Promise<FrameSurchargePrice | null> => {
  try {
    const data = await storefrontFetch<Response>(QUERY, { handle: FRAME_SURCHARGES_HANDLE });
    const node = data.productByHandle?.variants.edges.find((e) => e.node.sku === SURCH_PREMIUM_SKU)?.node;
    if (!node) {
      console.error('[frame-surcharge] SURCH-PREMIUM unavailable — premium frames fail closed. Run scripts/setup-frame-surcharges.js and publish to the headless channel.');
      return null;
    }
    return { variantId: node.id, price: Number(node.price.amount), currencyCode: node.price.currencyCode };
  } catch (err) {
    console.error('[frame-surcharge] Storefront fetch failed — premium frames fail closed', err);
    return null;
  }
});
