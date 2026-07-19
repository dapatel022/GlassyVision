import { describe, it, expect } from 'vitest';
import { deriveBadges, deriveSwatches, metafieldValue } from '@/features/shop/catalog/card-data';
import type { ShopifyProduct } from '@/lib/commerce/types';

function product(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'x',
    title: 'X',
    description: '',
    price: '95.00',
    currencyCode: 'USD',
    images: [],
    variants: [],
    metafields: [],
    tags: [],
    ...overrides,
  };
}

describe('deriveBadges', () => {
  it('derives all four badges, in stable order', () => {
    const p = product({
      tags: ['Featured', 'NEW', 'bestseller'],
      metafields: [
        { namespace: 'custom', key: 'polarized', value: 'true' },
        { namespace: 'custom', key: 'is_rx_capable', value: 'true' },
      ],
    });
    expect(deriveBadges(p).map((b) => b.id)).toEqual(['new', 'bestseller', 'polarized', 'rx']);
  });

  it('is case-insensitive on tags and returns [] when nothing applies', () => {
    expect(deriveBadges(product())).toEqual([]);
    expect(deriveBadges(product({ tags: ['New'] })).map((b) => b.label)).toEqual(['New']);
  });

  it('does not badge polarized/rx when metafield is false or absent', () => {
    const p = product({ metafields: [{ namespace: 'custom', key: 'polarized', value: 'false' }] });
    expect(deriveBadges(p)).toEqual([]);
  });
});

describe('deriveSwatches', () => {
  const variant = (color: string) => ({
    id: `v-${color}`,
    title: color,
    sku: null,
    price: '95.00',
    availableForSale: true,
    selectedOptions: [{ name: 'Color', value: color }],
  });

  it('dedupes colors preserving variant order and maps known names to hex', () => {
    const p = product({ variants: [variant('Black'), variant('Tortoise'), variant('Black')] });
    const swatches = deriveSwatches(p);
    expect(swatches.map((s) => s.name)).toEqual(['Black', 'Tortoise']);
    expect(swatches[0].hex).toBe('#1a1a1a');
  });

  it('falls back to a neutral hex for unknown color names and handles no color option', () => {
    const p = product({ variants: [variant('Cosmic Shimmer')] });
    expect(deriveSwatches(p)[0].hex).toBe('#d4d4d8');
    expect(deriveSwatches(product())).toEqual([]);
  });
});

describe('metafieldValue', () => {
  it('reads custom-namespace metafields and returns null when missing', () => {
    const p = product({ metafields: [{ namespace: 'custom', key: 'gender', value: 'unisex' }] });
    expect(metafieldValue(p, 'gender')).toBe('unisex');
    expect(metafieldValue(p, 'nope')).toBeNull();
  });
});
