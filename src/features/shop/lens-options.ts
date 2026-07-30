import type { LensType, LensConfig } from '@/features/cart/types';

// Option METADATA only. Prices live in Shopify (the hidden `lens-upgrades`
// product, one variant per option id) and are fetched at render time via
// getLensUpgradePricing() — never hardcoded here.
export interface LensOption {
  id: string;
  label: string;
  description?: string;
}

export const LENS_TYPES: Array<LensOption & { id: LensType; rxRequired: boolean }> = [
  { id: 'non_rx', label: 'Non-prescription', rxRequired: false, description: 'Plano lenses, no Rx needed' },
  { id: 'single_vision', label: 'Single-vision Rx', rxRequired: true, description: 'Distance or reading' },
  { id: 'progressive', label: 'Progressive Rx', rxRequired: true, description: 'Seamless distance + reading' },
];

export const COATINGS: LensOption[] = [
  { id: 'ar', label: 'Anti-reflective' },
  { id: 'blue_light', label: 'Blue-light filter' },
  { id: 'photochromic', label: 'Photochromic (Transitions)' },
];

export const TINTS: LensOption[] = [
  { id: 'none', label: 'Clear' },
  { id: 'grey', label: 'Grey' },
  { id: 'amber', label: 'Amber' },
  { id: 'green', label: 'G-15 Green' },
];

/**
 * The paid upgrade option ids a lens configuration selects. `non_rx` and the
 * clear tint are free and produce no add-on line item. Prices for these ids
 * come from Shopify via getLensUpgradePricing() — never from code.
 */
export function selectedOptionIds(config: LensConfig): string[] {
  return [
    ...(config.lensType !== 'non_rx' ? [config.lensType] : []),
    ...config.coatings,
    ...(config.tint !== 'none' ? [config.tint] : []),
  ];
}

export function lensRequiresRx(config: LensConfig): boolean {
  return LENS_TYPES.find((t) => t.id === config.lensType)?.rxRequired ?? false;
}

export const DEFAULT_LENS_CONFIG: LensConfig = {
  lensType: 'non_rx',
  coatings: [],
  tint: 'none',
};
