import type { ShopifyProduct } from '@/lib/commerce/types';

export interface CardBadge { id: string; label: string }
export interface CardSwatch { name: string; hex: string }

export function metafieldValue(p: ShopifyProduct, key: string): string | null {
  return p.metafields?.find((m) => m.namespace === 'custom' && m.key === key)?.value ?? null;
}

/** Ordered, data-driven card badges. Tags are matched case-insensitively. */
export function deriveBadges(p: ShopifyProduct): CardBadge[] {
  const tags = new Set((p.tags ?? []).map((t) => t.trim().toLowerCase()));
  const badges: CardBadge[] = [];
  if (tags.has('new')) badges.push({ id: 'new', label: 'New' });
  if (tags.has('bestseller')) badges.push({ id: 'bestseller', label: 'Bestseller' });
  if (metafieldValue(p, 'polarized') === 'true') badges.push({ id: 'polarized', label: 'Polarized' });
  if (metafieldValue(p, 'is_rx_capable') === 'true') badges.push({ id: 'rx', label: 'Rx Ready' });
  return badges;
}

// Common eyewear colorway names -> display hex. Fallback keeps unknown names visible.
const SWATCH_COLORS: Record<string, string> = {
  black: '#1a1a1a',
  'matte black': '#2b2b2b',
  tortoise: '#8b5a2b',
  havana: '#7a4a21',
  gold: '#c9a227',
  silver: '#c0c0c4',
  gunmetal: '#5b626b',
  grey: '#8e9196',
  gray: '#8e9196',
  brown: '#6b4226',
  navy: '#232f4b',
  blue: '#3457a6',
  green: '#3f6b4f',
  olive: '#6b6b3f',
  red: '#a63434',
  burgundy: '#6e2637',
  pink: '#d98ca4',
  clear: '#e8e6e1',
  crystal: '#dfe3e6',
  white: '#f2f2f0',
};
const SWATCH_FALLBACK = '#d4d4d8';

/** Unique variant Color values, in variant order, with a display hex. */
export function deriveSwatches(p: ShopifyProduct): CardSwatch[] {
  const seen = new Set<string>();
  const out: CardSwatch[] = [];
  for (const v of p.variants) {
    const color = v.selectedOptions.find((o) => o.name.toLowerCase() === 'color' || o.name.toLowerCase() === 'colour')?.value;
    if (!color || seen.has(color)) continue;
    seen.add(color);
    out.push({ name: color, hex: SWATCH_COLORS[color.trim().toLowerCase()] ?? SWATCH_FALLBACK });
  }
  return out;
}
