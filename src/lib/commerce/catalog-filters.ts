import type { ProductFilterInput, SearchParamsRecord } from './types';

// URL contract: see docs/superpowers/plans/2026-07-18-dynamic-catalog.md.
// Multi-value filters are repeated params; same-key filters are OR'd by Shopify.

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured', sortKey: 'COLLECTION_DEFAULT', reverse: false },
  { value: 'price-asc', label: 'Price: Low to High', sortKey: 'PRICE', reverse: false },
  { value: 'price-desc', label: 'Price: High to Low', sortKey: 'PRICE', reverse: true },
  { value: 'newest', label: 'Newest', sortKey: 'CREATED', reverse: true },
  { value: 'best-selling', label: 'Best Selling', sortKey: 'BEST_SELLING', reverse: false },
  { value: 'title', label: 'Alphabetical A–Z', sortKey: 'TITLE', reverse: false },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export interface CatalogQuery {
  filters: ProductFilterInput[];
  sort: SortValue;
  sortKey: string;
  reverse: boolean;
  after: string | null;
}

/** Params that are not filters and must never become ProductFilter inputs. */
const RESERVED_KEYS = new Set(['sort', 'after', 'quiz']);

function values(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function parsePrice(raw: string): ProductFilterInput | null {
  const m = raw.match(/^(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const price: { min?: number; max?: number } = {};
  if (m[1] !== undefined) price.min = Number(m[1]);
  if (m[2] !== undefined) price.max = Number(m[2]);
  return { price };
}

function paramToFilter(key: string, value: string): ProductFilterInput | null {
  if (key === 'available') return value === 'true' ? { available: true } : null;
  if (key === 'vendor') return { productVendor: value };
  if (key === 'ptype') return { productType: value };
  if (key === 'tag') return { tag: value };
  if (key.startsWith('opt.')) {
    const name = key.slice(4);
    return name ? { variantOption: { name, value } } : null;
  }
  if (key.startsWith('m.')) {
    const rest = key.slice(2);
    const dot = rest.indexOf('.');
    if (dot <= 0 || dot === rest.length - 1) return null;
    return {
      productMetafield: { namespace: rest.slice(0, dot), key: rest.slice(dot + 1), value },
    };
  }
  return null;
}

export function parseCatalogSearchParams(sp: SearchParamsRecord): CatalogQuery {
  const filters: ProductFilterInput[] = [];

  for (const [key, raw] of Object.entries(sp)) {
    if (RESERVED_KEYS.has(key)) continue;
    for (const value of values(raw)) {
      if (key === 'price') {
        const f = parsePrice(value);
        if (f) filters.push(f);
        continue;
      }
      const f = paramToFilter(key, value);
      if (f) filters.push(f);
    }
  }

  const sortRaw = values(sp.sort)[0];
  const opt = SORT_OPTIONS.find((o) => o.value === sortRaw) ?? SORT_OPTIONS[0];
  const after = values(sp.after)[0] ?? null;

  return { filters, sort: opt.value, sortKey: opt.sortKey, reverse: opt.reverse, after };
}

/**
 * Map a Storefront facet value's `input` JSON back to our URL param pair.
 * Returns null for price (rendered as a dedicated control) and unknown shapes.
 */
export function filterValueParam(inputJson: string): { key: string; value: string } | null {
  let input: unknown;
  try {
    input = JSON.parse(inputJson);
  } catch {
    return null;
  }
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;

  if (o.available === true) return { key: 'available', value: 'true' };
  if (typeof o.productVendor === 'string') return { key: 'vendor', value: o.productVendor };
  if (typeof o.productType === 'string') return { key: 'ptype', value: o.productType };
  if (typeof o.tag === 'string') return { key: 'tag', value: o.tag };

  const vo = o.variantOption as { name?: unknown; value?: unknown } | undefined;
  if (vo && typeof vo.name === 'string' && typeof vo.value === 'string') {
    return { key: `opt.${vo.name}`, value: vo.value };
  }

  const mf = o.productMetafield as { namespace?: unknown; key?: unknown; value?: unknown } | undefined;
  if (mf && typeof mf.namespace === 'string' && typeof mf.key === 'string' && typeof mf.value === 'string') {
    return { key: `m.${mf.namespace}.${mf.key}`, value: mf.value };
  }

  return null; // price + future shapes
}

/** Toggle one filter value on/off. Always resets pagination. */
export function toggleFilterParam(qs: string, key: string, value: string): string {
  const p = new URLSearchParams(qs);
  const all = p.getAll(key);
  p.delete(key);
  const kept = all.includes(value) ? all.filter((v) => v !== value) : [...all, value];
  for (const v of kept) p.append(key, v);
  p.delete('after');
  return p.toString();
}

/** Set (or with null, remove) a single-valued param. Always resets pagination. */
export function setSingleParam(qs: string, key: string, value: string | null): string {
  const p = new URLSearchParams(qs);
  if (value === null) p.delete(key);
  else p.set(key, value);
  p.delete('after');
  return p.toString();
}

/** Same query with a pagination cursor appended (for Load More). */
export function withAfter(qs: string, cursor: string): string {
  const p = new URLSearchParams(qs);
  p.set('after', cursor);
  return p.toString();
}

/** All active filter params (for removable pills), excluding reserved keys. */
export function activeFilterEntries(qs: string): Array<{ key: string; value: string }> {
  const p = new URLSearchParams(qs);
  const out: Array<{ key: string; value: string }> = [];
  for (const [key, value] of p.entries()) {
    if (RESERVED_KEYS.has(key)) continue;
    out.push({ key, value });
  }
  return out;
}

// ---- Legacy /shop?shape=…&size=…&sun=… support --------------------------------

const LEGACY_SIZE: Record<string, string> = { s: 'Small', m: 'Medium', l: 'Large' };

function normalizeShape(s: string): string {
  const t = s.trim().toLowerCase();
  return t === 'rectangular' ? 'rectangle' : t;
}

/** Translate the pre-catalog /shop query params into the new contract. */
export function mapLegacyShopParams(sp: SearchParamsRecord): string {
  const p = new URLSearchParams();

  const shape = values(sp.shape)[0];
  if (shape && shape !== 'any') {
    for (const s of shape.split(',').map(normalizeShape).filter(Boolean)) {
      p.append('m.custom.frame_shape', s);
    }
  }

  const size = values(sp.size)[0];
  if (size && LEGACY_SIZE[size]) p.set('opt.size', LEGACY_SIZE[size]);

  const sun = values(sp.sun)[0];
  if (sun === 'true') p.set('m.custom.lens_intent', 'sunglasses');
  if (sun === 'false') p.set('m.custom.lens_intent', 'clear-rx');

  if (values(sp.quiz)[0] === 'true') p.set('quiz', 'true');

  return p.toString();
}

// Face shape -> recommended frame shapes (mirrors the quiz's guidance table).
const QUIZ_SHAPE_RECOMMENDATION: Record<string, string[]> = {
  oval: ['square', 'rectangle'],
  square: ['round', 'oval'],
  heart: ['round', 'aviator'],
  diamond: ['oval'],
};

/** Build the post-quiz destination URL on the new catalog. */
export function buildQuizShopUrl(answers: Record<string, string>): string {
  const p = new URLSearchParams();

  for (const s of QUIZ_SHAPE_RECOMMENDATION[answers.shape] ?? []) {
    p.append('m.custom.frame_shape', s);
  }
  if (answers.size && LEGACY_SIZE[answers.size]) p.set('opt.size', LEGACY_SIZE[answers.size]);

  const isSun = answers.intent === 'rx_sun' || answers.intent === 'plano_sun';
  p.set('m.custom.lens_intent', isSun ? 'sunglasses' : 'clear-rx');
  p.set('quiz', 'true');

  return `/shop/all?${p.toString()}`;
}
