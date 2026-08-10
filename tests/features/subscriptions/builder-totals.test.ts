import { describe, it, expect } from 'vitest';
import { builderTotals } from '@/features/subscriptions/builder/builder-totals';
import type { BuilderState } from '@/features/subscriptions/builder/builder-state';
import type { BuilderData, BuilderFrame } from '@/features/subscriptions/lib/builder-data';
import type { MembershipPricing } from '@/lib/commerce/membership-pricing';
import type { LensPricingMap } from '@/lib/commerce/lens-pricing';
import type { FrameSurchargePrice } from '@/lib/commerce/frame-surcharge-pricing';
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';

/**
 * Pure totals helper for the review step (Task 11): tier price + summed
 * per-pair addon totals, plus a `blocked` flag that fails the checkout
 * button closed whenever any configured pair can't be fully priced
 * (pairAddonTotal returning null — see pair-pricing.test.ts). Null tiers
 * propagate straight through, matching every other builder surface's
 * fail-closed posture on missing pricing.
 */

const TIERS: MembershipPricing = [
  { sku: 'SUB-1PAIR', tier: 'solo', pairs: 1, variantId: 'gid://shopify/ProductVariant/101', price: 149, perPair: 149, currencyCode: 'USD' },
  { sku: 'SUB-2PAIR', tier: 'duo', pairs: 2, variantId: 'gid://shopify/ProductVariant/102', price: 269, perPair: 135, currencyCode: 'USD' },
  { sku: 'SUB-3PAIR', tier: 'trio', pairs: 3, variantId: 'gid://shopify/ProductVariant/103', price: 369, perPair: 123, currencyCode: 'USD' },
];

const FRAMES: BuilderFrame[] = [
  { handle: 'dusk-wayfarer', title: 'Dusk Wayfarer', image: null, variantId: 501, price: 89, premium: false, rxCapable: true },
  { handle: 'marina-oval-sun', title: 'Marina Oval Sun', image: null, variantId: 502, price: 129, premium: true, rxCapable: false },
];

const LENS_PRICING: LensPricingMap = {
  progressive: { optionId: 'progressive', variantId: 'gid://shopify/ProductVariant/1', price: 105, currencyCode: 'USD' },
  grey: { optionId: 'grey', variantId: 'gid://shopify/ProductVariant/4', price: 85, currencyCode: 'USD' },
};

const SURCHARGE: FrameSurchargePrice = { variantId: 'gid://shopify/ProductVariant/999', price: 40, currencyCode: 'USD' };

const DATA: BuilderData = { tiers: TIERS, frames: FRAMES, lensPricing: LENS_PRICING, surcharge: SURCHARGE };

const PROGRESSIVE_GREY: PairConfig = { v: 501, h: 'dusk-wayfarer', l: 'progressive', u: ['progressive'], t: 'grey' };
const UNPRICEABLE: PairConfig = { v: 501, h: 'dusk-wayfarer', l: 'single_vision', u: ['photochromic'], t: 'none' };

describe('builderTotals', () => {
  it('zero-config totals equal the tier price', () => {
    const state: BuilderState = { tier: 'duo', pairs: [null, null] };
    expect(builderTotals(state, DATA)).toEqual({
      tierPrice: 269,
      addons: 0,
      total: 269,
      perPairAllIn: 134.5,
      blocked: false,
    });
  });

  it('mixed pairs sum their addon totals', () => {
    const state: BuilderState = { tier: 'duo', pairs: [PROGRESSIVE_GREY, null] };
    // progressive (105) + grey tint (85) = 190 addon for the configured pair
    expect(builderTotals(state, DATA)).toEqual({
      tierPrice: 269,
      addons: 190,
      total: 459,
      perPairAllIn: 229.5,
      blocked: false,
    });
  });

  it('blocked propagates from an unpriceable pair', () => {
    const state: BuilderState = { tier: 'solo', pairs: [UNPRICEABLE] };
    const totals = builderTotals(state, DATA);
    expect(totals?.blocked).toBe(true);
    expect(totals?.tierPrice).toBe(149);
  });

  it('M1: a configured pair whose frame is missing from data.frames is blocked, not silently priced as non-premium', () => {
    const missingFramePair: PairConfig = { v: 999, h: 'no-longer-in-catalog', l: 'non_rx', u: [], t: 'none' };
    const state: BuilderState = { tier: 'solo', pairs: [missingFramePair] };
    const totals = builderTotals(state, DATA);
    expect(totals?.blocked).toBe(true);
    expect(totals?.addons).toBe(0);
    expect(totals?.tierPrice).toBe(149);
  });

  it('returns null when tiers are unavailable', () => {
    const state: BuilderState = { tier: 'duo', pairs: [null, null] };
    expect(builderTotals(state, { ...DATA, tiers: null })).toBeNull();
  });

  it('returns null when no tier is selected', () => {
    const state: BuilderState = { tier: null, pairs: [] };
    expect(builderTotals(state, DATA)).toBeNull();
  });
});
