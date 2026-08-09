import type { MembershipPricing } from './membership-pricing';

/**
 * Pure membership savings math. Client-safe: NO server imports — the cart
 * nudge bundles this file. All figures derive from live Shopify prices
 * passed in by the server wrapper (membership-math.ts).
 */

export interface TierMath {
  tier: 'solo' | 'duo' | 'trio';
  pairs: number;
  yearly: number;
  perPair: number;
  alaCarteYear: number;
  savings: number;
  savingsPct: number;
  currencyCode: string;
}

export interface MembershipMath {
  representativeFramePrice: number;
  bestPerPair: number;
  tiers: TierMath[];
  currencyCode: string;
}

/** Products that are money-mechanics, not frames — excluded from all frame math. */
export const MATH_EXCLUDED_HANDLES = ['membership', 'lens-upgrades'] as const;

/** Median of valid (>0, finite) prices; null under 3 — not representative. */
export function medianPrice(prices: number[]): number | null {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length < 3) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildMembershipMath(
  pricing: MembershipPricing,
  framePrices: number[],
): MembershipMath | null {
  if (!pricing) return null;
  const median = medianPrice(framePrices);
  if (median === null) return null;
  const tiers: TierMath[] = pricing.map((t) => {
    const alaCarteYear = Math.round(t.pairs * median);
    const savings = Math.round(alaCarteYear - t.price);
    return {
      tier: t.tier,
      pairs: t.pairs,
      yearly: t.price,
      perPair: t.perPair,
      alaCarteYear,
      savings,
      savingsPct: alaCarteYear > 0 ? Math.round((savings / alaCarteYear) * 100) : 0,
      currencyCode: t.currencyCode,
    };
  });
  return {
    representativeFramePrice: Math.round(median),
    bestPerPair: Math.min(...tiers.map((t) => t.perPair)),
    tiers,
    currencyCode: tiers[0].currencyCode,
  };
}

/** "Or from $X/pair with membership" for a PDP price. Null when not a real saving. */
export function pdpMathLine(
  math: MembershipMath | null,
  productPrice: number,
): { perPair: number; savingsVsThisFrame: number } | null {
  if (!math || !Number.isFinite(productPrice)) return null;
  const savingsVsThisFrame = Math.round(productPrice - math.bestPerPair);
  if (savingsVsThisFrame <= 0) return null;
  return { perPair: math.bestPerPair, savingsVsThisFrame };
}

/** Tier whose pairs === frameCount (1–3), only when the cart already costs more. */
export function matchTierForCart(
  math: MembershipMath | null,
  frameCount: number,
  frameSubtotal: number,
): TierMath | null {
  if (!math || frameCount < 1 || frameCount > 3 || !Number.isFinite(frameSubtotal)) return null;
  const tier = math.tiers.find((t) => t.pairs === frameCount);
  if (!tier || frameSubtotal <= tier.yearly) return null;
  return tier;
}

/** Frame-only count + subtotal from cart lines (membership/upgrade lines excluded). */
export function cartFrameSummary(
  lines: Array<{ productHandle: string; unitPrice: number; quantity: number }>,
): { frameCount: number; frameSubtotal: number } {
  const frames = lines.filter(
    (l) => !(MATH_EXCLUDED_HANDLES as readonly string[]).includes(l.productHandle),
  );
  return {
    frameCount: frames.reduce((n, l) => n + l.quantity, 0),
    frameSubtotal: frames.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  };
}
