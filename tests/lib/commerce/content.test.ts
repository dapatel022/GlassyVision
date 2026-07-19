import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', () => ({
  storefrontFetch: mockStorefrontFetch,
  HERO_SLIDES_QUERY: 'HERO_SLIDES_QUERY',
  HOMEPAGE_QUERY: 'HOMEPAGE_QUERY',
}));

beforeEach(() => mockStorefrontFetch.mockReset());

const PRODUCT_REF = {
  handle: 'halcyon-aviator',
  title: 'Halcyon Aviator',
  description: 'Product description text.',
  priceRange: { minVariantPrice: { amount: '95.00' } },
  featuredImage: { url: 'https://cdn/product.png' },
};

function fields(entries: Array<{ key: string; value?: string | null; reference?: unknown }>) {
  return { fields: entries.map((e) => ({ key: e.key, value: e.value ?? null, reference: e.reference ?? null })) };
}

describe('getHomepageContent — hero slides', () => {
  it('maps a full slide: product-sourced title/handle/price, overrides applied, sorted by order', async () => {
    mockStorefrontFetch
      .mockResolvedValueOnce({
        metaobjects: {
          edges: [
            {
              node: fields([
                { key: 'product', reference: PRODUCT_REF },
                { key: 'tag', value: 'Second' },
                { key: 'color_name', value: 'B' },
                { key: 'color_hex', value: '#222222' },
                { key: 'order', value: '2' },
              ]),
            },
            {
              node: fields([
                { key: 'product', reference: { ...PRODUCT_REF, handle: 'meridian-round', title: 'Meridian Round' } },
                { key: 'tag', value: 'First' },
                { key: 'description', value: 'Editorial copy.' },
                { key: 'color_name', value: 'A' },
                { key: 'color_hex', value: '#111111' },
                { key: 'image', reference: { image: { url: 'https://cdn/override.png' } } },
                { key: 'order', value: '1' },
              ]),
            },
          ],
        },
      })
      .mockResolvedValueOnce({ metaobject: null });

    const { getHomepageContent } = await import('@/lib/commerce/content');
    const c = await getHomepageContent();

    expect(c.slides).toHaveLength(2);
    // sorted by order: 'First' slide first
    expect(c.slides![0]).toEqual({
      handle: 'meridian-round',
      title: 'Meridian Round',
      price: '95',
      colorName: 'A',
      colorHex: '#111111',
      imageUrl: 'https://cdn/override.png', // image override wins
      description: 'Editorial copy.',
      tag: 'First',
    });
    // no description field -> product description; no image override -> featuredImage
    expect(c.slides![1].description).toBe('Product description text.');
    expect(c.slides![1].imageUrl).toBe('https://cdn/product.png');
    expect(c.slides![1].price).toBe('95');
  });

  it('drops slides without a resolvable product and returns null when none survive', async () => {
    mockStorefrontFetch
      .mockResolvedValueOnce({
        metaobjects: { edges: [{ node: fields([{ key: 'tag', value: 'Orphan' }]) }] },
      })
      .mockResolvedValueOnce({ metaobject: null });
    const { getHomepageContent } = await import('@/lib/commerce/content');
    const c = await getHomepageContent();
    expect(c.slides).toBeNull();
  });
});

describe('getHomepageContent — homepage singleton', () => {
  it('parses ticker list (JSON-encoded value) and badge text', async () => {
    mockStorefrontFetch
      .mockResolvedValueOnce({ metaobjects: { edges: [] } })
      .mockResolvedValueOnce({
        metaobject: fields([
          { key: 'ticker_phrases', value: '["Phrase one","Phrase two"]' },
          { key: 'badge_text', value: 'Drop N° 02 · Hand-Finished' },
        ]),
      });
    const { getHomepageContent } = await import('@/lib/commerce/content');
    const c = await getHomepageContent();
    expect(c.tickerPhrases).toEqual(['Phrase one', 'Phrase two']);
    expect(c.badgeText).toBe('Drop N° 02 · Hand-Finished');
    expect(c.slides).toBeNull();
  });

  it('malformed ticker JSON -> null tickerPhrases (never throws)', async () => {
    mockStorefrontFetch
      .mockResolvedValueOnce({ metaobjects: { edges: [] } })
      .mockResolvedValueOnce({ metaobject: fields([{ key: 'ticker_phrases', value: 'not json' }]) });
    const { getHomepageContent } = await import('@/lib/commerce/content');
    const c = await getHomepageContent();
    expect(c.tickerPhrases).toBeNull();
  });
});

describe('getHomepageContent — failure isolation', () => {
  it('returns all-null on total fetch failure, and per-part null on partial failure', async () => {
    const { getHomepageContent } = await import('@/lib/commerce/content');

    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new Error('boom'));
    expect(await getHomepageContent()).toEqual({ slides: null, tickerPhrases: null, badgeText: null });

    // slides fail, singleton succeeds
    mockStorefrontFetch
      .mockRejectedValueOnce(new Error('scope'))
      .mockResolvedValueOnce({ metaobject: fields([{ key: 'badge_text', value: 'Still here' }]) });
    const c = await getHomepageContent();
    expect(c.slides).toBeNull();
    expect(c.badgeText).toBe('Still here');
  });
});
