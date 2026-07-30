import type { LensType, LensConfig } from '@/features/cart/types';

export interface LensOption {
  id: string;
  label: string;
  priceDelta: number;
  description?: string;
}

export const LENS_TYPES: Array<LensOption & { id: LensType; rxRequired: boolean }> = [
  { id: 'non_rx', label: 'Non-prescription', priceDelta: 0, rxRequired: false, description: 'Plano lenses, no Rx needed' },
  { id: 'single_vision', label: 'Single-vision Rx', priceDelta: 50, rxRequired: true, description: 'Distance or reading' },
  { id: 'progressive', label: 'Progressive Rx', priceDelta: 150, rxRequired: true, description: 'Seamless distance + reading' },
];

export const COATINGS: LensOption[] = [
  { id: 'ar', label: 'Anti-reflective', priceDelta: 30 },
  { id: 'blue_light', label: 'Blue-light filter', priceDelta: 25 },
  { id: 'photochromic', label: 'Photochromic (Transitions)', priceDelta: 85 },
];

export const TINTS: LensOption[] = [
  { id: 'none', label: 'Clear', priceDelta: 0 },
  { id: 'grey', label: 'Grey', priceDelta: 40 },
  { id: 'amber', label: 'Amber', priceDelta: 40 },
  { id: 'green', label: 'G-15 Green', priceDelta: 40 },
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
