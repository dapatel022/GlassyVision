import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', () => ({
  storefrontFetch: mockStorefrontFetch,
  HERO_SLIDES_QUERY: 'HERO_SLIDES_QUERY',
  HOMEPAGE_QUERY: 'HOMEPAGE_QUERY',
  BANNERS_QUERY: 'BANNERS_QUERY',
  MENU_QUERY: 'MENU_QUERY',
}));

beforeEach(() => {
  mockStorefrontFetch.mockReset();
  vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'glassyvision-o9b6utgq.myshopify.com');
});

function banner(entries: Array<{ key: string; value?: string | null; reference?: unknown }>) {
  return { node: { fields: entries.map((e) => ({ key: e.key, value: e.value ?? null, reference: e.reference ?? null })) } };
}

describe('getBanners', () => {
  it('groups active banners by slot, sorted by order, with cta + image mapped', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      metaobjects: {
        edges: [
          banner([
            { key: 'slot', value: 'announcement' },
            { key: 'title', value: 'Free shipping over $75' },
            { key: 'cta_label', value: 'Shop now' },
            { key: 'cta_url', value: '/collections/all' },
            { key: 'active', value: 'true' },
            { key: 'order', value: '2' },
          ]),
          banner([
            { key: 'slot', value: 'announcement' },
            { key: 'title', value: 'Drop 02 live' },
            { key: 'active', value: 'true' },
            { key: 'order', value: '1' },
          ]),
          banner([
            { key: 'slot', value: 'plp_grid' },
            { key: 'title', value: 'Take the quiz' },
            { key: 'body', value: 'Find your frame in 60 seconds.' },
            { key: 'image', reference: { image: { url: 'https://cdn/x.png' } } },
            { key: 'active', value: 'true' },
            { key: 'order', value: '1' },
          ]),
        ],
      },
    });
    const { getBanners } = await import('@/lib/commerce/content');
    const b = await getBanners();

    expect(b.announcement).toHaveLength(2);
    expect(b.announcement[0].title).toBe('Drop 02 live'); // order 1 first
    expect(b.announcement[1].cta).toEqual({ href: '/shop/all', label: 'Shop now', external: false });
    expect(b.plp_grid[0]).toMatchObject({
      title: 'Take the quiz',
      body: 'Find your frame in 60 seconds.',
      imageUrl: 'https://cdn/x.png',
      cta: null,
    });
  });

  it('drops inactive, titleless, and unknown-slot banners', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      metaobjects: {
        edges: [
          banner([{ key: 'slot', value: 'cart' }, { key: 'title', value: 'Off' }, { key: 'active', value: 'false' }]),
          banner([{ key: 'slot', value: 'cart' }, { key: 'active', value: 'true' }]), // no title
          banner([{ key: 'slot', value: 'sidebar' }, { key: 'title', value: 'X' }, { key: 'active', value: 'true' }]),
        ],
      },
    });
    const { getBanners } = await import('@/lib/commerce/content');
    expect(await getBanners()).toEqual({});
  });

  it('strips a dangerous cta_url but keeps the banner', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      metaobjects: {
        edges: [
          banner([
            { key: 'slot', value: 'thanks' },
            { key: 'title', value: 'Join the club' },
            { key: 'cta_label', value: 'Click' },
            { key: 'cta_url', value: 'javascript:alert(1)' },
            { key: 'active', value: 'true' },
          ]),
        ],
      },
    });
    const { getBanners } = await import('@/lib/commerce/content');
    const b = await getBanners();
    expect(b.thanks[0].title).toBe('Join the club');
    expect(b.thanks[0].cta).toBeNull();
  });

  it('returns {} on fetch error (never throws)', async () => {
    mockStorefrontFetch.mockRejectedValueOnce(new Error('scope missing'));
    const { getBanners } = await import('@/lib/commerce/content');
    expect(await getBanners()).toEqual({});
  });
});
