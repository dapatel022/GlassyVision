import type { MembershipPricing } from '@/lib/commerce/membership-pricing';
import type { MembershipMath } from '@/lib/commerce/membership-math-core';

export interface ComparisonColumns {
  alaCarteYear: number | null; // 3 × representative frame price; null → omit column
  membershipYear: number;      // live Trio yearly price
  currencyCode: string;
}

/**
 * 12-month comparison on a Trio basis (3 pairs). Null when tier pricing is
 * unavailable — the whole table hides rather than showing a partial money
 * comparison. Frame-math-only failure keeps the table but drops its
 * à-la-carte column (spec §5).
 */
export function buildComparison(
  pricing: MembershipPricing,
  math: MembershipMath | null,
): ComparisonColumns | null {
  if (!pricing) return null;
  const trio = pricing.find((t) => t.tier === 'trio');
  if (!trio) return null;
  const trioMath = math?.tiers.find((t) => t.tier === 'trio') ?? null;
  return {
    alaCarteYear: trioMath?.alaCarteYear ?? null,
    membershipYear: trio.price,
    currencyCode: trio.currencyCode,
  };
}
