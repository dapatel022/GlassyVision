import { describe, it, expect } from 'vitest';
import {
  medianPrice, buildMembershipMath, pdpMathLine, matchTierForCart, cartFrameSummary,
} from '@/lib/commerce/membership-math-core';
import type { MembershipPricing } from '@/lib/commerce/membership-pricing';

const PRICING: MembershipPricing = [
  { sku: 'SUB-1PAIR', tier: 'solo', pairs: 1, variantId: 'gid://1', price: 89, perPair: 89, currencyCode: 'USD' },
  { sku: 'SUB-2PAIR', tier: 'duo', pairs: 2, variantId: 'gid://2', price: 149, perPair: 75, currencyCode: 'USD' },
  { sku: 'SUB-3PAIR', tier: 'trio', pairs: 3, variantId: 'gid://3', price: 189, perPair: 63, currencyCode: 'USD' },
];

describe('medianPrice', () => {
  it('returns the middle value for an odd count', () => {
    expect(medianPrice([120, 250, 180])).toBe(180);
  });
  it('averages the two middle values for an even count', () => {
    expect(medianPrice([100, 200, 300, 400])).toBe(250);
  });
  it('ignores zero/negative/NaN prices', () => {
    expect(medianPrice([0, -5, NaN, 100, 200, 300])).toBe(200);
  });
  it('returns null with fewer than 3 valid prices (not representative)', () => {
    expect(medianPrice([100, 200])).toBeNull();
    expect(medianPrice([])).toBeNull();
  });
});

describe('buildMembershipMath', () => {
  it('computes per-tier à-la-carte cost, savings, and pct from the median', () => {
    const math = buildMembershipMath(PRICING, [150, 250, 350]); // median 250
    expect(math).not.toBeNull();
    expect(math!.representativeFramePrice).toBe(250);
    expect(math!.bestPerPair).toBe(63);
    const trio = math!.tiers.find((t) => t.tier === 'trio')!;
    expect(trio.alaCarteYear).toBe(750);       // 3 × 250
    expect(trio.savings).toBe(561);            // 750 − 189
    expect(trio.savingsPct).toBe(75);          // round(561/750 × 100)
    expect(trio.currencyCode).toBe('USD');
  });
  it('is null when membership pricing is null (fail closed)', () => {
    expect(buildMembershipMath(null, [150, 250, 350])).toBeNull();
  });
  it('is null when the catalog has fewer than 3 priced frames (fail closed)', () => {
    expect(buildMembershipMath(PRICING, [250, 300])).toBeNull();
  });
});

describe('pdpMathLine', () => {
  const math = buildMembershipMath(PRICING, [150, 250, 350])!;
  it('returns per-pair price and savings vs this frame', () => {
    expect(pdpMathLine(math, 250)).toEqual({ perPair: 63, savingsVsThisFrame: 187 });
  });
  it('is null when the frame is not cheaper as a member (never fake a saving)', () => {
    expect(pdpMathLine(math, 63)).toBeNull();
    expect(pdpMathLine(math, 40)).toBeNull();
  });
  it('is null when math is unavailable', () => {
    expect(pdpMathLine(null, 250)).toBeNull();
  });
});

describe('matchTierForCart', () => {
  const math = buildMembershipMath(PRICING, [150, 250, 350])!;
  it('matches the tier whose pairs equal the frame count when the subtotal beats the tier price', () => {
    expect(matchTierForCart(math, 3, 437)?.tier).toBe('trio');
    expect(matchTierForCart(math, 1, 250)?.tier).toBe('solo');
  });
  it('is null when the subtotal does not exceed the tier price', () => {
    expect(matchTierForCart(math, 3, 189)).toBeNull();
    expect(matchTierForCart(math, 1, 89)).toBeNull();
  });
  it('is null for 0 or 4+ frames', () => {
    expect(matchTierForCart(math, 0, 999)).toBeNull();
    expect(matchTierForCart(math, 4, 999)).toBeNull();
  });
  it('is null when math is unavailable', () => {
    expect(matchTierForCart(null, 3, 999)).toBeNull();
  });
});

describe('cartFrameSummary', () => {
  it('counts quantities and subtotal for frame lines only', () => {
    const lines = [
      { productHandle: 'dusk-wayfarer', unitPrice: 149, quantity: 2 },
      { productHandle: 'halcyon-aviator', unitPrice: 139, quantity: 1 },
      { productHandle: 'membership', unitPrice: 149, quantity: 1 },
      { productHandle: 'lens-upgrades', unitPrice: 40, quantity: 1 },
    ];
    expect(cartFrameSummary(lines)).toEqual({ frameCount: 3, frameSubtotal: 437 });
  });
  it('returns zeros for an empty cart', () => {
    expect(cartFrameSummary([])).toEqual({ frameCount: 0, frameSubtotal: 0 });
  });
});
