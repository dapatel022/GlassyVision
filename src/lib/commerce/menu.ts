import { storefrontFetch, MENU_QUERY } from './shopify-storefront';

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

/** Today's hardcoded header links — the guaranteed fallback. */
export const DEFAULT_NAV_LINKS: NavLink[] = [
  { href: '/shop', label: 'Shop' },
  { href: '/quiz', label: 'Frame Finder' },
  { href: '/drops', label: 'Drops' },
  { href: '/story', label: 'Story' },
];

// Shopify menu-item paths -> app routes.
function mapPath(pathname: string): string {
  if (pathname === '/collections' || pathname === '/collections/') return '/shop';
  const collection = pathname.match(/^\/collections\/([^/]+)\/?$/);
  if (collection) return `/shop/${collection[1]}`;
  const product = pathname.match(/^\/products\/([^/]+)\/?$/);
  if (product) return `/p/${product[1]}`;
  const page = pathname.match(/^\/pages\/([^/]+)\/?$/);
  if (page) return `/${page[1]}`;
  return pathname;
}

/**
 * Turn a Shopify menu item URL into an app link. Same-store URLs become
 * relative app routes; foreign hosts stay absolute (external). Unparsable
 * input -> null (caller drops the item).
 */
export function transformMenuUrl(
  url: string,
  storeDomain: string,
): { href: string; external: boolean } | null {
  if (!url) return null;

  if (url.startsWith('/') && !url.startsWith('//')) {
    const [path, search = ''] = url.split('?');
    return { href: mapPath(path) + (search ? `?${search}` : ''), external: false };
  }

  const absolute = url.startsWith('//') ? `https:${url}` : url;
  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    return null;
  }

  // Merchant menu URLs are untrusted input: only web/contact schemes may
  // reach an <a href> — javascript:/data:/etc. would be stored XSS.
  const SAFE_PROTOCOLS = ['https:', 'http:', 'mailto:', 'tel:'];
  if (!SAFE_PROTOCOLS.includes(parsed.protocol)) return null;

  if (parsed.host !== storeDomain) {
    return { href: absolute, external: true };
  }
  return { href: mapPath(parsed.pathname) + parsed.search, external: false };
}

interface MenuResponse {
  menu: { items: Array<{ id: string; title: string; url: string | null }> } | null;
}

/** Fetch a Shopify navigation menu. Error or missing menu -> [] (nav is not money data — no mock fallback; the caller's default covers it). */
export async function getMenu(handle = 'main-menu'): Promise<NavLink[]> {
  try {
    const data = await storefrontFetch<MenuResponse>(MENU_QUERY, { handle });
    if (!data.menu) {
      console.warn(`Shopify menu handle not found — header will use default links`);
      return [];
    }
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN ?? '';
    return data.menu.items.flatMap((item) => {
      const t = item.url ? transformMenuUrl(item.url, storeDomain) : null;
      return t ? [{ href: t.href, label: item.title, external: t.external }] : [];
    });
  } catch (err) {
    console.warn('Shopify getMenu failed — header will use default links', err);
    return [];
  }
}

/** The header's nav: the merchant's main-menu, or the built-in defaults. */
export async function getSiteNav(): Promise<NavLink[]> {
  const links = await getMenu();
  return links.length > 0 ? links : DEFAULT_NAV_LINKS;
}
