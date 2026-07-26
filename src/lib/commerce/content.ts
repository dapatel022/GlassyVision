import { cache } from 'react';
import { storefrontFetch, HERO_SLIDES_QUERY, HOMEPAGE_QUERY, BANNERS_QUERY } from './shopify-storefront';
import { transformMenuUrl } from './menu';

export interface HeroSlide {
  handle: string;
  title: string;
  price: string;
  colorName: string;
  colorHex: string;
  imageUrl: string;
  description: string;
  tag: string;
}

export interface HomepageContent {
  slides: HeroSlide[] | null;
  tickerPhrases: string[] | null;
  badgeText: string | null;
}

interface ProductRef {
  handle: string;
  title: string;
  description: string;
  priceRange: { minVariantPrice: { amount: string } };
  featuredImage: { url: string } | null;
}

interface FieldNode {
  key: string;
  value: string | null;
  reference?: unknown;
}

interface HeroSlidesResponse {
  metaobjects: { edges: Array<{ node: { fields: FieldNode[] } }> };
}

interface HomepageResponse {
  metaobject: { fields: FieldNode[] } | null;
}

function fieldMap(fieldsArr: FieldNode[]): Map<string, FieldNode> {
  return new Map(fieldsArr.map((f) => [f.key, f]));
}

function isProductRef(ref: unknown): ref is ProductRef {
  return !!ref && typeof ref === 'object' && 'handle' in ref && 'priceRange' in ref;
}

function imageRefUrl(ref: unknown): string | null {
  const img = (ref as { image?: { url?: string } } | null)?.image?.url;
  return typeof img === 'string' ? img : null;
}

function mapSlide(node: { fields: FieldNode[] }): (HeroSlide & { order: number }) | null {
  const f = fieldMap(node.fields);
  const product = f.get('product')?.reference;
  if (!isProductRef(product)) return null; // slide without a product is unusable

  const override = imageRefUrl(f.get('image')?.reference);
  const imageUrl = override ?? product.featuredImage?.url ?? '';
  if (!imageUrl) return null; // hero requires an image

  return {
    handle: product.handle,
    title: product.title,
    price: Number(product.priceRange.minVariantPrice.amount).toFixed(0),
    colorName: f.get('color_name')?.value ?? '',
    colorHex: f.get('color_hex')?.value ?? '#d4d4d8',
    imageUrl,
    description: f.get('description')?.value || product.description,
    tag: f.get('tag')?.value ?? '',
    order: Number(f.get('order')?.value ?? '0') || 0,
  };
}

function parsePhrases(value: string | null | undefined): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const phrases = parsed.filter((p): p is string => typeof p === 'string' && p.length > 0);
    return phrases.length > 0 ? phrases : null;
  } catch {
    return null;
  }
}

/**
 * Merchant-editable homepage content from Shopify Metaobjects. Every part
 * degrades independently to null (callers fall back to built-in content) —
 * the homepage can never go blank because of a content failure.
 */
export async function getHomepageContent(): Promise<HomepageContent> {
  let slides: HeroSlide[] | null = null;
  let tickerPhrases: string[] | null = null;
  let badgeText: string | null = null;

  try {
    const data = await storefrontFetch<HeroSlidesResponse>(HERO_SLIDES_QUERY);
    const mapped = data.metaobjects.edges
      .map((e) => mapSlide(e.node))
      .filter((s): s is HeroSlide & { order: number } => s !== null)
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...slide }) => slide);
    slides = mapped.length > 0 ? mapped : null;
  } catch (err) {
    console.warn('Shopify hero_slide metaobjects unavailable — using built-in hero', err);
  }

  try {
    const data = await storefrontFetch<HomepageResponse>(HOMEPAGE_QUERY);
    if (data.metaobject) {
      const f = fieldMap(data.metaobject.fields);
      tickerPhrases = parsePhrases(f.get('ticker_phrases')?.value);
      badgeText = f.get('badge_text')?.value ?? null;
    }
  } catch (err) {
    console.warn('Shopify homepage metaobject unavailable — using built-in ticker/badge', err);
  }

  return { slides, tickerPhrases, badgeText };
}

export const BANNER_SLOTS = ['announcement', 'plp_grid', 'quiz_results', 'cart', 'pdp', 'thanks'] as const;

export interface SiteBanner {
  slot: string;
  title: string;
  body: string | null;
  cta: { href: string; label: string; external: boolean } | null;
  imageUrl: string | null;
}

interface BannersResponse {
  metaobjects: { edges: Array<{ node: { fields: FieldNode[] } }> };
}

function mapBanner(node: { fields: FieldNode[] }): (SiteBanner & { order: number }) | null {
  const f = fieldMap(node.fields);
  const slot = f.get('slot')?.value ?? '';
  const title = f.get('title')?.value ?? '';
  if (!(BANNER_SLOTS as readonly string[]).includes(slot)) return null;
  if (!title || f.get('active')?.value !== 'true') return null;

  // Merchant CTA URLs are untrusted: same transform + scheme allowlist as menus.
  let cta: SiteBanner['cta'] = null;
  const ctaLabel = f.get('cta_label')?.value;
  const ctaUrl = f.get('cta_url')?.value;
  if (ctaLabel && ctaUrl) {
    const t = transformMenuUrl(ctaUrl, process.env.SHOPIFY_STORE_DOMAIN ?? '');
    if (t) cta = { href: t.href, label: ctaLabel, external: t.external };
  }

  return {
    slot,
    title,
    body: f.get('body')?.value ?? null,
    cta,
    imageUrl: imageRefUrl(f.get('image')?.reference),
    order: Number(f.get('order')?.value ?? '0') || 0,
  };
}

/**
 * Active banners grouped by slot, order-sorted. Error/empty -> {} (slots render
 * nothing). cache() dedupes the layout + page call within one server render —
 * storefrontFetch is a POST, which Next does not request-memoize on its own.
 */
export const getBanners = cache(async (): Promise<Record<string, SiteBanner[]>> => {
  try {
    const data = await storefrontFetch<BannersResponse>(BANNERS_QUERY);
    const grouped: Record<string, (SiteBanner & { order: number })[]> = {};
    for (const edge of data.metaobjects.edges) {
      const b = mapBanner(edge.node);
      if (!b) continue;
      (grouped[b.slot] ??= []).push(b);
    }
    const out: Record<string, SiteBanner[]> = {};
    for (const [slot, list] of Object.entries(grouped)) {
      out[slot] = list.sort((a, b) => a.order - b.order).map(({ order: _order, ...rest }) => rest);
    }
    return out;
  } catch (err) {
    console.warn('Shopify banner metaobjects unavailable — banner slots render nothing', err);
    return {};
  }
});
