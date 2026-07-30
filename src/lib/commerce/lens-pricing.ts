import { cache } from 'react';
import { storefrontFetch } from './shopify-storefront';

/**
 * Live pricing for lens upgrades. Prices are OWNED by the hidden Shopify
 * product `lens-upgrades` (one variant per option, SKU-keyed LENSUP-*) —
 * created by scripts/setup-lens-addons.js. No dollar amounts in code: a
 * merchant price edit in Shopify admin takes effect without a deploy, and
 * Shopify Markets converts currency automatically.
 *
 * FAIL CLOSED: when this returns null (product missing/unpublished, API
 * error), paid upgrades must be unselectable on the PDP, block checkout in
 * the cart, and 409 at /checkout. Never sell an upgrade we cannot charge.
 */

export const LENS_UPGRADES_HANDLE = 'lens-upgrades';
export const LENSUP_SKU_PREFIX = 'LENSUP-';

export interface LensUpgradePrice {
  optionId: string;
  variantId: string;
  price: number;
  currencyCode: string;
}

export type LensPricingMap = Record<string, LensUpgradePrice>;

const LENS_UPGRADES_QUERY = /* GraphQL */ `
  query LensUpgrades($handle: String!) {
    productByHandle(handle: $handle) {
      variants(first: 20) {
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

interface LensUpgradesResponse {
  productByHandle: {
    variants: {
      edges: Array<{
        node: { id: string; sku: string | null; price: { amount: string; currencyCode: string } };
      }>;
    };
  } | null;
}

/** LENSUP-TINT_GREY -> grey, LENSUP-SINGLE_VISION -> single_vision; null for foreign SKUs. */
export function skuToOptionId(sku: string): string | null {
  if (!sku.startsWith(LENSUP_SKU_PREFIX)) return null;
  const rest = sku.slice(LENSUP_SKU_PREFIX.length);
  const unprefixed = rest.startsWith('TINT_') ? rest.slice('TINT_'.length) : rest;
  return unprefixed.toLowerCase();
}

export const getLensUpgradePricing = cache(async (): Promise<LensPricingMap | null> => {
  try {
    const data = await storefrontFetch<LensUpgradesResponse>(LENS_UPGRADES_QUERY, {
      handle: LENS_UPGRADES_HANDLE,
    });
    if (!data.productByHandle) {
      console.error('[lens-pricing] lens-upgrades product unavailable — paid upgrades fail closed. Run scripts/setup-lens-addons.js and publish the product to the headless channel.');
      return null;
    }
    const map: LensPricingMap = {};
    for (const { node } of data.productByHandle.variants.edges) {
      const optionId = node.sku ? skuToOptionId(node.sku) : null;
      if (!optionId) continue;
      map[optionId] = {
        optionId,
        variantId: node.id,
        price: Number(node.price.amount),
        currencyCode: node.price.currencyCode,
      };
    }
    return map;
  } catch (err) {
    console.error('[lens-pricing] Storefront fetch failed — paid upgrades fail closed', err);
    return null;
  }
});
