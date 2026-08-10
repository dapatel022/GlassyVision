import { describe, it, expect } from 'vitest';
import { pairAddonTotal } from '@/features/subscriptions/builder/pair-pricing';
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';
import type { LensPricingMap } from '@/lib/commerce/lens-pricing';
import type { FrameSurchargePrice } from '@/lib/commerce/frame-surcharge-pricing';

/**
 * Pure pricing helper shared by Task 10 (PairConfigurator) and Task 11
 * (BuilderReview). null return means something chargeable in the config is
 * unpriceable — the UI must disable/block rather than render a guessed
 * price or silently drop the charge.
 */

const LENS_PRICING: LensPricingMap = {
  progressive: { optionId: 'progressive', variantId: 'gid://shopify/ProductVariant/1', price: 105, currencyCode: 'USD' },
  photochromic: { optionId: 'photochromic', variantId: 'gid://shopify/ProductVariant/2', price: 85, currencyCode: 'USD' },
  ar: { optionId: 'ar', variantId: 'gid://shopify/ProductVariant/3', price: 30, currencyCode: 'USD' },
  grey: { optionId: 'grey', variantId: 'gid://shopify/ProductVariant/4', price: 85, currencyCode: 'USD' },
  amber: { optionId: 'amber', variantId: 'gid://shopify/ProductVariant/5', price: 85, currencyCode: 'USD' },
  green: { optionId: 'green', variantId: 'gid://shopify/ProductVariant/6', price: 85, currencyCode: 'USD' },
  single_vision: { optionId: 'single_vision', variantId: 'gid://shopify/ProductVariant/7', price: 0, currencyCode: 'USD' },
  blue_light: { optionId: 'blue_light', variantId: 'gid://shopify/ProductVariant/8', price: 0, currencyCode: 'USD' },
};

const SURCHARGE: FrameSurchargePrice = { variantId: 'gid://shopify/ProductVariant/999', price: 40, currencyCode: 'USD' };

const COVERED_ONLY: PairConfig = { v: 501, h: 'dusk-wayfarer', l: 'single_vision', u: [], t: 'none' };
const PROGRESSIVE_GREY: PairConfig = { v: 501, h: 'dusk-wayfarer', l: 'progressive', u: ['progressive'], t: 'grey' };

describe('pairAddonTotal', () => {
  it('is 0 for a fully-covered pair (single-vision, no tint, no paid upgrades)', () => {
    expect(pairAddonTotal(COVERED_ONLY, false, LENS_PRICING, SURCHARGE)).toBe(0);
  });

  it('sums live prices for chargeable options (progressive + grey tint)', () => {
    expect(pairAddonTotal(PROGRESSIVE_GREY, false, LENS_PRICING, SURCHARGE)).toBe(190);
  });

  it('adds the live surcharge price for a premium frame', () => {
    expect(pairAddonTotal(COVERED_ONLY, true, LENS_PRICING, SURCHARGE)).toBe(40);
    expect(pairAddonTotal(PROGRESSIVE_GREY, true, LENS_PRICING, SURCHARGE)).toBe(230);
  });

  it('returns null when a chargeable option has no live price', () => {
    const { progressive: _progressive, ...withoutProgressive } = LENS_PRICING;
    expect(pairAddonTotal(PROGRESSIVE_GREY, false, withoutProgressive, SURCHARGE)).toBeNull();
    expect(pairAddonTotal(PROGRESSIVE_GREY, false, null, SURCHARGE)).toBeNull();
  });

  it('returns null for a premium frame when the surcharge is unavailable', () => {
    expect(pairAddonTotal(COVERED_ONLY, true, LENS_PRICING, null)).toBeNull();
    expect(pairAddonTotal(PROGRESSIVE_GREY, true, LENS_PRICING, null)).toBeNull();
  });
});
