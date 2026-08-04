import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', () => ({
  storefrontFetch: mockStorefrontFetch,
  MENU_QUERY: 'MENU_QUERY',
}));

beforeEach(() => {
  mockStorefrontFetch.mockReset();
  vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'glassyvision-o9b6utgq.myshopify.com');
});

describe('transformMenuUrl', () => {
  const DOMAIN = 'glassyvision-o9b6utgq.myshopify.com';

  it('maps store URLs onto app routes', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    const t = (u: string) => transformMenuUrl(u, DOMAIN);
    expect(t(`https://${DOMAIN}/collections/sunglasses`)).toEqual({ href: '/shop/sunglasses', external: false });
    expect(t(`https://${DOMAIN}/collections/all`)).toEqual({ href: '/shop/all', external: false });
    expect(t(`https://${DOMAIN}/collections`)).toEqual({ href: '/shop', external: false });
    expect(t(`https://${DOMAIN}/products/halcyon-aviator`)).toEqual({ href: '/p/halcyon-aviator', external: false });
    expect(t(`https://${DOMAIN}/pages/story`)).toEqual({ href: '/story', external: false });
    expect(t(`https://${DOMAIN}/`)).toEqual({ href: '/', external: false });
    expect(t(`https://${DOMAIN}/quiz`)).toEqual({ href: '/quiz', external: false });
  });

  it('matches the store domain case-insensitively', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl(`https://${DOMAIN.toUpperCase()}/collections/optical`, DOMAIN)).toEqual({
      href: '/shop/optical',
      external: false,
    });
    expect(transformMenuUrl(`https://${DOMAIN}/collections/optical`, DOMAIN.toUpperCase())).toEqual({
      href: '/shop/optical',
      external: false,
    });
  });

  it('preserves query strings on same-store links', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl(`https://${DOMAIN}/collections/all?sort=newest`, DOMAIN)).toEqual({
      href: '/shop/all?sort=newest',
      external: false,
    });
  });

  it('passes relative URLs through the same mapping', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl('/collections/optical', DOMAIN)).toEqual({ href: '/shop/optical', external: false });
    expect(transformMenuUrl('/quiz', DOMAIN)).toEqual({ href: '/quiz', external: false });
  });

  it('keeps foreign hosts absolute and external', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl('https://instagram.com/glassyvision', DOMAIN)).toEqual({
      href: 'https://instagram.com/glassyvision',
      external: true,
    });
  });

  it('returns null for empty or unparsable input', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl('', DOMAIN)).toBeNull();
    expect(transformMenuUrl('not a url at all %%%', DOMAIN)).toBeNull();
  });

  it('treats protocol-relative URLs as external', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl('//instagram.com/glassyvision', DOMAIN)).toEqual({
      href: 'https://instagram.com/glassyvision',
      external: true,
    });
    expect(transformMenuUrl(`//${DOMAIN}/collections/optical`, DOMAIN)).toEqual({
      href: '/shop/optical',
      external: false,
    });
  });

  it('rejects dangerous URL schemes; allows http(s)/mailto/tel externals', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl('javascript:alert(1)', DOMAIN)).toBeNull();
    expect(transformMenuUrl('data:text/html,x', DOMAIN)).toBeNull();
    expect(transformMenuUrl('vbscript:x', DOMAIN)).toBeNull();
    expect(transformMenuUrl('mailto:hello@glassyvision.com', DOMAIN)).toEqual({
      href: 'mailto:hello@glassyvision.com',
      external: true,
    });
    expect(transformMenuUrl('tel:+15551234567', DOMAIN)).toEqual({
      href: 'tel:+15551234567',
      external: true,
    });
  });
});

describe('getMenu', () => {
  it('maps menu items through the transform and drops null urls', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      menu: {
        items: [
          { id: '1', title: 'Sunglasses', url: 'https://glassyvision-o9b6utgq.myshopify.com/collections/sunglasses' },
          { id: '2', title: 'Frame Finder', url: 'https://glassyvision-o9b6utgq.myshopify.com/quiz' },
          { id: '3', title: 'Broken', url: null },
          { id: '4', title: 'Instagram', url: 'https://instagram.com/gv' },
        ],
      },
    });
    const { getMenu } = await import('@/lib/commerce/menu');
    const links = await getMenu();
    expect(mockStorefrontFetch).toHaveBeenCalledWith('MENU_QUERY', { handle: 'main-menu' });
    expect(links).toEqual([
      { href: '/shop/sunglasses', label: 'Sunglasses', external: false },
      { href: '/quiz', label: 'Frame Finder', external: false },
      { href: 'https://instagram.com/gv', label: 'Instagram', external: true },
    ]);
  });

  it('returns [] when the menu is missing and on fetch error', async () => {
    const { getMenu } = await import('@/lib/commerce/menu');
    mockStorefrontFetch.mockResolvedValueOnce({ menu: null });
    expect(await getMenu()).toEqual([]);
    mockStorefrontFetch.mockRejectedValueOnce(new Error('scope missing'));
    expect(await getMenu()).toEqual([]);
  });

  it('warns when the menu handle is missing (not just on fetch errors)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockStorefrontFetch.mockResolvedValueOnce({ menu: null });
    const { getMenu } = await import('@/lib/commerce/menu');
    expect(await getMenu()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('getSiteNav', () => {
  it('returns menu links when present, DEFAULT_NAV_LINKS otherwise', async () => {
    const { getSiteNav, DEFAULT_NAV_LINKS } = await import('@/lib/commerce/menu');
    mockStorefrontFetch.mockResolvedValueOnce({
      menu: { items: [{ id: '1', title: 'Shop', url: '/collections/all' }] },
    });
    expect(await getSiteNav()).toEqual([{ href: '/shop/all', label: 'Shop', external: false }]);

    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    expect(await getSiteNav()).toEqual(DEFAULT_NAV_LINKS);
    expect(DEFAULT_NAV_LINKS).toEqual([
      { href: '/shop', label: 'Shop' },
      { href: '/membership', label: 'Membership' },
      { href: '/quiz', label: 'Frame Finder' },
      { href: '/drops', label: 'Drops' },
      { href: '/story', label: 'Story' },
    ]);
  });
});
