import { describe, it, expect } from 'vitest';
import { buildUpgradeRows } from '@/features/subscriptions/lib/upgrade-rows';
import { buildComparison } from '@/features/subscriptions/lib/comparison-rows';
import { buildMembershipMath } from '@/lib/commerce/membership-math-core';
import type { LensPricingMap } from '@/lib/commerce/lens-pricing';
import type { MembershipPricing } from '@/lib/commerce/membership-pricing';

const PRICING: MembershipPricing = [
  { sku: 'SUB-1PAIR', tier: 'solo', pairs: 1, variantId: 'gid://1', price: 89, perPair: 89, currencyCode: 'USD' },
  { sku: 'SUB-2PAIR', tier: 'duo', pairs: 2, variantId: 'gid://2', price: 149, perPair: 75, currencyCode: 'USD' },
  { sku: 'SUB-3PAIR', tier: 'trio', pairs: 3, variantId: 'gid://3', price: 189, perPair: 63, currencyCode: 'USD' },
];

const LENS_PRICING: LensPricingMap = {
  progressive: { optionId: 'progressive', variantId: 'gid://p', price: 150, currencyCode: 'USD' },
  photochromic: { optionId: 'photochromic', variantId: 'gid://c', price: 85, currencyCode: 'USD' },
  ar: { optionId: 'ar', variantId: 'gid://a', price: 30, currencyCode: 'USD' },
  grey: { optionId: 'grey', variantId: 'gid://g', price: 40, currencyCode: 'USD' },
  amber: { optionId: 'amber', variantId: 'gid://m', price: 40, currencyCode: 'USD' },
  green: { optionId: 'green', variantId: 'gid://n', price: 40, currencyCode: 'USD' },
};

describe('buildUpgradeRows', () => {
  it('maps live prices onto the redemption-charged upgrade list', () => {
    const rows = buildUpgradeRows(LENS_PRICING);
    expect(rows.find((r) => r.label === 'Progressive Rx lenses')).toEqual({
      label: 'Progressive Rx lenses', price: 150, currencyCode: 'USD',
    });
    expect(rows).toHaveLength(6);
  });
  it('yields null prices when pricing is unavailable — UI shows no numbers', () => {
    const rows = buildUpgradeRows(null);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.price === null)).toBe(true);
  });
  it('yields a null price for an individually missing option', () => {
    const { progressive: _omit, ...partial } = LENS_PRICING;
    const rows = buildUpgradeRows(partial as LensPricingMap);
    expect(rows.find((r) => r.label === 'Progressive Rx lenses')!.price).toBeNull();
  });
});

describe('buildComparison', () => {
  const math = buildMembershipMath(PRICING, [150, 250, 350]); // median 250
  it('builds Trio-basis columns from live prices', () => {
    expect(buildComparison(PRICING, math)).toEqual({
      alaCarteYear: 750, membershipYear: 189, currencyCode: 'USD',
    });
  });
  it('omits the à-la-carte column when frame math is unavailable', () => {
    expect(buildComparison(PRICING, null)).toEqual({
      alaCarteYear: null, membershipYear: 189, currencyCode: 'USD',
    });
  });
  it('is null when tier pricing is unavailable (whole table hides)', () => {
    expect(buildComparison(null, math)).toBeNull();
  });
});
