import type { LensPricingMap } from '@/lib/commerce/lens-pricing';

export interface UpgradeRow {
  label: string;
  price: number | null;
  currencyCode: string | null;
}

// Upgrades charged at redemption (FAQ: "same prices as the shop"). Option ids
// are skuToOptionId() outputs for the LENSUP-* variants. Membership-included
// options (single_vision, blue_light) are NOT rows; the premium-frame
// surcharge is omitted until its variant is wired (spec 2026-08-08).
const REDEMPTION_UPGRADES: Array<{ optionId: string; label: string }> = [
  { optionId: 'progressive', label: 'Progressive Rx lenses' },
  { optionId: 'photochromic', label: 'Photochromic (Transitions)' },
  { optionId: 'ar', label: 'Anti-reflective coating' },
  { optionId: 'grey', label: 'Grey tint' },
  { optionId: 'amber', label: 'Amber tint' },
  { optionId: 'green', label: 'G-15 Green tint' },
];

/** Live prices onto the fixed label list; null price → "priced at redemption". */
export function buildUpgradeRows(pricing: LensPricingMap | null): UpgradeRow[] {
  return REDEMPTION_UPGRADES.map(({ optionId, label }) => ({
    label,
    price: pricing?.[optionId]?.price ?? null,
    currencyCode: pricing?.[optionId]?.currencyCode ?? null,
  }));
}
