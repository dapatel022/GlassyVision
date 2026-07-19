# Dynamic Catalog (Category Pages + Faceted Filters) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded, name-guessing `/shop` filters with a fully dynamic, Shopify-driven catalog: collection-based category pages at `/shop/[collection]`, a faceted filter sidebar rendered from the Storefront API's per-collection filter list, URL-driven filter/sort/pagination state, richer product cards, and a category-tile landing page.

**Architecture:** Categories are Shopify **Collections**; facets are configured in Shopify **Search & Discovery** and returned by the Storefront API `collection.products(filters:…)` query — the UI renders whatever comes back (nothing hardcoded). The URL query string is the single source of filter state; the PLP is a server component that parses `searchParams` → `ProductFilter[]` → one GraphQL query. Spec: `docs/superpowers/specs/2026-07-18-dynamic-catalog-design.md`.

**Tech Stack:** Next.js 16 App Router (server components + a few small client components), Shopify Storefront GraphQL API `2025-01` via the existing `storefrontFetch`, Tailwind 4 with the project's tokens, Vitest.

## Global Constraints

- All Shopify GraphQL stays inside `src/lib/commerce/` (lock-in rule from CLAUDE.md). Components never call `storefrontFetch` directly.
- Storefront API version stays `2025-01` (already pinned in `src/lib/commerce/shopify-storefront.ts`).
- Never serve mock data in production: follow the existing `allowMockFallback()` pattern in `src/lib/commerce/shopify.ts` (dev/test → mock fallback on error; production → empty results + `console.error`).
- All new pages use `export const revalidate = 900` (existing shop caching posture).
- Styling uses the project's Tailwind tokens exactly as in existing components: `text-ink`, `text-muted`, `text-muted-soft`, `text-accent`, `border-line`, `bg-base-deeper`, `font-mono`/`font-serif italic` accents, uppercase `tracking-wider` labels, `rounded-xl` cards, `border border-line bg-white`.
- `eslint-plugin-jsx-a11y` (recommended) is enforced — every input needs a label, every interactive control a discernible name; decorative images `aria-hidden`.
- Tests live under `tests/` mirroring `src/` (e.g. `tests/lib/commerce/…`), Vitest, node environment. Run a single file with `npx vitest run <path>`; full suite `npm test`.
- Run `npm run lint` before every commit. Commit messages via HEREDOC.
- Filter-state changes MUST reset pagination (drop `after`) — a stale cursor with new filters returns wrong pages.
- Storefront `FilterValue.input` is a JSON scalar — it may arrive as a JSON **string or object** depending on serialization. Always normalize (`typeof input === 'string' ? input : JSON.stringify(input)`).

## URL contract (the plan's shared language)

| Param | Meaning | Storefront `ProductFilter` |
|---|---|---|
| `sort` | sort key (`featured` default, omitted) | `sortKey` + `reverse` |
| `after` | pagination cursor | `after` |
| `price=50-150` (`50-`, `-150`) | price range | `{price:{min,max}}` |
| `available=true` | in stock only | `{available:true}` |
| `vendor=X` (repeatable) | brand | `{productVendor:"X"}` |
| `ptype=X` (repeatable) | product type | `{productType:"X"}` |
| `tag=X` (repeatable) | tag | `{tag:"X"}` |
| `opt.<name>=X` (repeatable) | variant option | `{variantOption:{name,value}}` |
| `m.<namespace>.<key>=X` (repeatable) | metafield | `{productMetafield:{namespace,key,value}}` |
| `quiz=true` | passthrough marker, ignored by filters | — |

Multi-value = **repeated params** (`?vendor=A&vendor=B`), never comma-joined (values may contain commas). Same-key filters are OR'd by Shopify; different keys AND'd.

---

### Task 1: `catalog-filters.ts` — pure URL/filter/sort logic (TDD)

**Files:**
- Create: `src/lib/commerce/catalog-filters.ts`
- Modify: `src/lib/commerce/types.ts` (append filter/catalog types)
- Test: `tests/lib/commerce/catalog-filters.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (used by Tasks 2, 5, 6, 7, 8, 9):
  - types in `@/lib/commerce/types`: `ProductFilterInput`, `SearchParamsRecord`, `ShopifyCollection`, `CatalogFacet`, `CatalogFacetValue`, `CatalogPageInfo`, `CollectionProductsResult`
  - `SORT_OPTIONS: readonly {value,label,sortKey,reverse}[]`
  - `parseCatalogSearchParams(sp: SearchParamsRecord): CatalogQuery` where `CatalogQuery = { filters: ProductFilterInput[]; sort: string; sortKey: string; reverse: boolean; after: string | null }`
  - `filterValueParam(inputJson: string): {key,value} | null`
  - `toggleFilterParam(qs: string, key: string, value: string): string`
  - `setSingleParam(qs: string, key: string, value: string | null): string`
  - `withAfter(qs: string, cursor: string): string`
  - `activeFilterEntries(qs: string): {key,value}[]`
  - `mapLegacyShopParams(sp: SearchParamsRecord): string`
  - `buildQuizShopUrl(answers: Record<string,string>): string`

- [ ] **Step 1: Append catalog types to `src/lib/commerce/types.ts`**

```ts
// --- Catalog (collections + faceted filtering) ---

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export type ProductFilterInput =
  | { available: boolean }
  | { productVendor: string }
  | { productType: string }
  | { tag: string }
  | { price: { min?: number; max?: number } }
  | { variantOption: { name: string; value: string } }
  | { productMetafield: { namespace: string; key: string; value: string } };

export interface ShopifyCollection {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: ShopifyImage | null;
}

export interface CatalogFacetValue {
  id: string;
  label: string;
  count: number;
  /** URL param pair this value toggles; null when unmappable (skip rendering). */
  param: { key: string; value: string } | null;
}

export interface CatalogFacet {
  id: string;
  label: string;
  /** Storefront filter type: 'LIST' | 'PRICE_RANGE' | 'BOOLEAN' */
  type: string;
  values: CatalogFacetValue[];
}

export interface CatalogPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface CollectionProductsResult {
  collection: ShopifyCollection | null;
  products: ShopifyProduct[];
  facets: CatalogFacet[];
  pageInfo: CatalogPageInfo;
}
```

Also add `tags?: string[];` to the existing `ShopifyProduct` interface (after `metafields`).

- [ ] **Step 2: Write the failing tests**

Create `tests/lib/commerce/catalog-filters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SORT_OPTIONS,
  parseCatalogSearchParams,
  filterValueParam,
  toggleFilterParam,
  setSingleParam,
  withAfter,
  activeFilterEntries,
  mapLegacyShopParams,
  buildQuizShopUrl,
} from '@/lib/commerce/catalog-filters';

describe('parseCatalogSearchParams', () => {
  it('returns defaults for empty params', () => {
    const q = parseCatalogSearchParams({});
    expect(q.filters).toEqual([]);
    expect(q.sort).toBe('featured');
    expect(q.sortKey).toBe('COLLECTION_DEFAULT');
    expect(q.reverse).toBe(false);
    expect(q.after).toBeNull();
  });

  it('maps every documented param kind to its ProductFilter', () => {
    const q = parseCatalogSearchParams({
      vendor: 'GlassyVision',
      ptype: 'Sunglasses',
      tag: 'new',
      available: 'true',
      'opt.color': 'Black',
      'm.custom.frame_shape': 'round',
      price: '50-150',
    });
    expect(q.filters).toEqual(
      expect.arrayContaining([
        { productVendor: 'GlassyVision' },
        { productType: 'Sunglasses' },
        { tag: 'new' },
        { available: true },
        { variantOption: { name: 'color', value: 'Black' } },
        { productMetafield: { namespace: 'custom', key: 'frame_shape', value: 'round' } },
        { price: { min: 50, max: 150 } },
      ]),
    );
    expect(q.filters).toHaveLength(7);
  });

  it('expands repeated params into multiple filters (OR semantics)', () => {
    const q = parseCatalogSearchParams({ 'm.custom.frame_shape': ['round', 'aviator'] });
    expect(q.filters).toEqual([
      { productMetafield: { namespace: 'custom', key: 'frame_shape', value: 'round' } },
      { productMetafield: { namespace: 'custom', key: 'frame_shape', value: 'aviator' } },
    ]);
  });

  it('parses open-ended price ranges', () => {
    expect(parseCatalogSearchParams({ price: '50-' }).filters).toEqual([{ price: { min: 50 } }]);
    expect(parseCatalogSearchParams({ price: '-150' }).filters).toEqual([{ price: { max: 150 } }]);
  });

  it('ignores unknown, reserved, and malformed params', () => {
    const q = parseCatalogSearchParams({
      quiz: 'true',
      bogus: 'x',
      price: 'not-a-range',
      'm.broken': 'novalue', // missing key segment
      sort: 'price-asc',
      after: 'cursor123',
    });
    expect(q.filters).toEqual([]);
    expect(q.sort).toBe('price-asc');
    expect(q.sortKey).toBe('PRICE');
    expect(q.reverse).toBe(false);
    expect(q.after).toBe('cursor123');
  });

  it('maps every sort option to the documented sortKey/reverse', () => {
    const bySort = Object.fromEntries(SORT_OPTIONS.map((o) => [o.value, o]));
    expect(bySort['featured']).toMatchObject({ sortKey: 'COLLECTION_DEFAULT', reverse: false });
    expect(bySort['price-asc']).toMatchObject({ sortKey: 'PRICE', reverse: false });
    expect(bySort['price-desc']).toMatchObject({ sortKey: 'PRICE', reverse: true });
    expect(bySort['newest']).toMatchObject({ sortKey: 'CREATED', reverse: true });
    expect(bySort['best-selling']).toMatchObject({ sortKey: 'BEST_SELLING', reverse: false });
    expect(bySort['title']).toMatchObject({ sortKey: 'TITLE', reverse: false });
    // unknown sort falls back to featured
    expect(parseCatalogSearchParams({ sort: 'nonsense' }).sortKey).toBe('COLLECTION_DEFAULT');
  });
});

describe('filterValueParam (facet input JSON -> URL param pair)', () => {
  it('maps each Storefront filter input shape', () => {
    expect(filterValueParam('{"available":true}')).toEqual({ key: 'available', value: 'true' });
    expect(filterValueParam('{"productVendor":"GlassyVision"}')).toEqual({ key: 'vendor', value: 'GlassyVision' });
    expect(filterValueParam('{"productType":"Sunglasses"}')).toEqual({ key: 'ptype', value: 'Sunglasses' });
    expect(filterValueParam('{"tag":"new"}')).toEqual({ key: 'tag', value: 'new' });
    expect(filterValueParam('{"variantOption":{"name":"color","value":"Black"}}')).toEqual({
      key: 'opt.color', value: 'Black',
    });
    expect(filterValueParam('{"productMetafield":{"namespace":"custom","key":"frame_shape","value":"round"}}')).toEqual({
      key: 'm.custom.frame_shape', value: 'round',
    });
  });

  it('returns null for price and unknown shapes and invalid JSON', () => {
    expect(filterValueParam('{"price":{"min":0,"max":200}}')).toBeNull();
    expect(filterValueParam('{"somethingNew":1}')).toBeNull();
    expect(filterValueParam('not json')).toBeNull();
  });
});

describe('URL mutation helpers', () => {
  it('toggleFilterParam adds, removes, and always drops after', () => {
    const added = toggleFilterParam('sort=newest&after=abc', 'vendor', 'GV');
    const p1 = new URLSearchParams(added);
    expect(p1.getAll('vendor')).toEqual(['GV']);
    expect(p1.get('sort')).toBe('newest');
    expect(p1.get('after')).toBeNull();

    const removed = toggleFilterParam('vendor=GV&vendor=Other', 'vendor', 'GV');
    expect(new URLSearchParams(removed).getAll('vendor')).toEqual(['Other']);
  });

  it('setSingleParam sets, replaces, deletes, and drops after', () => {
    expect(new URLSearchParams(setSingleParam('', 'sort', 'price-asc')).get('sort')).toBe('price-asc');
    expect(new URLSearchParams(setSingleParam('sort=x&after=c', 'sort', 'newest')).get('after')).toBeNull();
    expect(new URLSearchParams(setSingleParam('sort=x', 'sort', null)).get('sort')).toBeNull();
  });

  it('withAfter appends the cursor without touching filters', () => {
    const qs = withAfter('vendor=GV', 'CURSOR');
    const p = new URLSearchParams(qs);
    expect(p.get('after')).toBe('CURSOR');
    expect(p.get('vendor')).toBe('GV');
  });

  it('activeFilterEntries lists filter params only', () => {
    expect(activeFilterEntries('vendor=GV&sort=newest&after=c&quiz=true&m.custom.gender=mens')).toEqual([
      { key: 'vendor', value: 'GV' },
      { key: 'm.custom.gender', value: 'mens' },
    ]);
  });
});

describe('legacy /shop param mapping', () => {
  it('maps shape/size/sun/quiz to the new contract', () => {
    const qs = mapLegacyShopParams({ shape: 'round,aviator', size: 'm', sun: 'true', quiz: 'true', style: 'bold' });
    const p = new URLSearchParams(qs);
    expect(p.getAll('m.custom.frame_shape')).toEqual(['round', 'aviator']);
    expect(p.get('opt.size')).toBe('Medium');
    expect(p.get('m.custom.lens_intent')).toBe('sunglasses');
    expect(p.get('quiz')).toBe('true');
    expect(p.get('style')).toBeNull(); // legacy style had no real behavior — dropped
  });

  it('normalizes rectangular->rectangle, ignores any, maps sun=false to clear-rx', () => {
    const qs = mapLegacyShopParams({ shape: 'rectangular', size: 'any', sun: 'false' });
    const p = new URLSearchParams(qs);
    expect(p.getAll('m.custom.frame_shape')).toEqual(['rectangle']);
    expect(p.get('opt.size')).toBeNull();
    expect(p.get('m.custom.lens_intent')).toBe('clear-rx');
  });
});

describe('buildQuizShopUrl', () => {
  it('builds the /shop/all URL from quiz answers (oval face -> square+rectangle)', () => {
    const url = buildQuizShopUrl({ shape: 'oval', size: 'm', intent: 'rx_sun', style: 'bold' });
    expect(url.startsWith('/shop/all?')).toBe(true);
    const p = new URLSearchParams(url.split('?')[1]);
    expect(p.getAll('m.custom.frame_shape')).toEqual(['square', 'rectangle']);
    expect(p.get('opt.size')).toBe('Medium');
    expect(p.get('m.custom.lens_intent')).toBe('sunglasses');
    expect(p.get('quiz')).toBe('true');
  });

  it('omits the shape filter for unmapped face shapes and maps non-sun intents to clear-rx', () => {
    const url = buildQuizShopUrl({ shape: 'round', size: 's', intent: 'rx_clear' });
    const p = new URLSearchParams(url.split('?')[1]);
    expect(p.getAll('m.custom.frame_shape')).toEqual([]);
    expect(p.get('opt.size')).toBe('Small');
    expect(p.get('m.custom.lens_intent')).toBe('clear-rx');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/lib/commerce/catalog-filters.test.ts`
Expected: FAIL — `Cannot find module '@/lib/commerce/catalog-filters'` (or unresolved import).

- [ ] **Step 4: Implement `src/lib/commerce/catalog-filters.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/commerce/catalog-filters.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/lib/commerce/catalog-filters.ts src/lib/commerce/types.ts tests/lib/commerce/catalog-filters.test.ts
git commit -m "$(cat <<'EOF'
feat(catalog): URL<->ProductFilter contract, sort map, legacy/quiz mapping

Pure module: parseCatalogSearchParams, filterValueParam (facet input JSON ->
param pair), toggle/set/withAfter URL helpers (all reset pagination),
mapLegacyShopParams, buildQuizShopUrl. Catalog types added to commerce types.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Collections data layer — GraphQL queries + `getCollections` / `getCollectionProducts` (TDD)

**Files:**
- Modify: `src/lib/commerce/shopify-storefront.ts` (add `PRODUCT_FIELDS`, `COLLECTIONS_QUERY`, `COLLECTION_PRODUCTS_QUERY`; add `tags` to `PRODUCTS_QUERY` and `PRODUCT_BY_HANDLE_QUERY`)
- Modify: `src/lib/commerce/shopify.ts` (map `tags`; add `getCollections`, `getCollectionProducts`)
- Test: `tests/lib/commerce/collections.test.ts`

**Interfaces:**
- Consumes: `storefrontFetch<T>(query, variables)`; `filterValueParam` from Task 1; types from Task 1.
- Produces (used by Tasks 6, 7, 8):
  - `getCollections(first?: number): Promise<ShopifyCollection[]>`
  - `getCollectionProducts(handle: string, opts?: { filters?: ProductFilterInput[]; sortKey?: string; reverse?: boolean; after?: string | null; first?: number }): Promise<CollectionProductsResult>`
  - `ShopifyProduct.tags: string[]` now populated (default `[]`).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/commerce/collections.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStorefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', () => ({
  storefrontFetch: mockStorefrontFetch,
  PRODUCTS_QUERY: 'PRODUCTS_QUERY',
  PRODUCT_BY_HANDLE_QUERY: 'PRODUCT_BY_HANDLE_QUERY',
  CART_CREATE_MUTATION: 'CART_CREATE_MUTATION',
  COLLECTIONS_QUERY: 'COLLECTIONS_QUERY',
  COLLECTION_PRODUCTS_QUERY: 'COLLECTION_PRODUCTS_QUERY',
}));
vi.mock('@/lib/commerce/shopify-admin', () => ({
  updateInventoryLevel: vi.fn(),
  createFulfillment: vi.fn(),
  createRefund: vi.fn(),
}));

beforeEach(() => mockStorefrontFetch.mockReset());
afterEach(() => vi.unstubAllEnvs());

const PRODUCT_NODE = {
  id: 'gid://shopify/Product/1',
  handle: 'halcyon-aviator',
  title: 'Halcyon Aviator',
  description: 'desc',
  tags: ['new', 'bestseller'],
  priceRange: { minVariantPrice: { amount: '95.00', currencyCode: 'USD' } },
  images: { edges: [] },
  variants: { edges: [] },
  metafields: [{ namespace: 'custom', key: 'is_rx_capable', value: 'true' }],
};

describe('getCollections', () => {
  it('maps collection edges to ShopifyCollection[]', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      collections: {
        edges: [
          {
            node: {
              id: 'gid://shopify/Collection/1',
              handle: 'mens-sunglasses',
              title: "Men's Sunglasses",
              description: 'Sun for men',
              image: { url: 'https://cdn/x.png', altText: null, width: 100, height: 100 },
            },
          },
        ],
      },
    });
    const { getCollections } = await import('@/lib/commerce/shopify');
    const cols = await getCollections();
    expect(mockStorefrontFetch).toHaveBeenCalledWith('COLLECTIONS_QUERY', { first: 50 });
    expect(cols).toEqual([
      {
        id: 'gid://shopify/Collection/1',
        handle: 'mens-sunglasses',
        title: "Men's Sunglasses",
        description: 'Sun for men',
        image: { url: 'https://cdn/x.png', altText: null, width: 100, height: 100 },
      },
    ]);
  });

  it('returns [] on error in production (never mocks)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    const { getCollections } = await import('@/lib/commerce/shopify');
    expect(await getCollections()).toEqual([]);
  });

  it('falls back to a mock "all" collection on error outside production', async () => {
    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    const { getCollections } = await import('@/lib/commerce/shopify');
    const cols = await getCollections();
    expect(cols).toHaveLength(1);
    expect(cols[0].handle).toBe('all');
  });
});

describe('getCollectionProducts', () => {
  it('sends handle, paging, sort and filters; maps products, facets and pageInfo', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      collection: {
        id: 'gid://shopify/Collection/1',
        handle: 'all',
        title: 'All Frames',
        description: '',
        image: null,
        products: {
          filters: [
            {
              id: 'filter.p.m.custom.frame_shape',
              label: 'Frame shape',
              type: 'LIST',
              values: [
                {
                  id: 'v1',
                  label: 'Round',
                  count: 2,
                  input: '{"productMetafield":{"namespace":"custom","key":"frame_shape","value":"round"}}',
                },
              ],
            },
            {
              id: 'filter.v.price',
              label: 'Price',
              type: 'PRICE_RANGE',
              values: [{ id: 'p1', label: 'Price', count: 3, input: { price: { min: 0, max: 200 } } }],
            },
          ],
          pageInfo: { hasNextPage: true, endCursor: 'CUR' },
          edges: [{ node: PRODUCT_NODE }],
        },
      },
    });

    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    const res = await getCollectionProducts('all', {
      filters: [{ available: true }],
      sortKey: 'PRICE',
      reverse: true,
      after: 'PREV',
      first: 12,
    });

    expect(mockStorefrontFetch).toHaveBeenCalledWith('COLLECTION_PRODUCTS_QUERY', {
      handle: 'all',
      first: 12,
      after: 'PREV',
      filters: [{ available: true }],
      sortKey: 'PRICE',
      reverse: true,
    });

    expect(res.collection?.title).toBe('All Frames');
    expect(res.products).toHaveLength(1);
    expect(res.products[0].tags).toEqual(['new', 'bestseller']);
    expect(res.pageInfo).toEqual({ hasNextPage: true, endCursor: 'CUR' });

    // LIST facet value got a param pair from its input JSON…
    expect(res.facets[0].values[0].param).toEqual({ key: 'm.custom.frame_shape', value: 'round' });
    // …the price facet (object-typed input) survives normalization with param null.
    expect(res.facets[1].type).toBe('PRICE_RANGE');
    expect(res.facets[1].values[0].param).toBeNull();
  });

  it('omits filters/after/sort variables when not provided', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({ collection: null });
    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    await getCollectionProducts('missing');
    expect(mockStorefrontFetch).toHaveBeenCalledWith('COLLECTION_PRODUCTS_QUERY', {
      handle: 'missing',
      first: 24,
      after: null,
      filters: undefined,
      sortKey: 'COLLECTION_DEFAULT',
      reverse: false,
    });
  });

  it('returns null collection for an unknown handle', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({ collection: null });
    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    const res = await getCollectionProducts('nope');
    expect(res.collection).toBeNull();
    expect(res.products).toEqual([]);
    expect(res.facets).toEqual([]);
    expect(res.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it('production error path returns empty result, no mock data', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    const res = await getCollectionProducts('all');
    expect(res.collection).toBeNull();
    expect(res.products).toEqual([]);
  });

  it('dev error path falls back to mock products with empty facets', async () => {
    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    const res = await getCollectionProducts('all');
    expect(res.collection?.handle).toBe('all');
    expect(res.products.length).toBeGreaterThan(0);
    expect(res.facets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/commerce/collections.test.ts`
Expected: FAIL — `getCollections is not a function` / missing exports.

- [ ] **Step 3: Add the queries to `src/lib/commerce/shopify-storefront.ts`**

Add `tags` to the node fields of the existing `PRODUCTS_QUERY` and `PRODUCT_BY_HANDLE_QUERY` (one line, next to `title`). Then append:

```ts
// Shared product field selection for catalog queries. Includes the metafields
// the storefront reads for badges and facets.
const PRODUCT_FIELDS = `
  id
  handle
  title
  description
  tags
  priceRange {
    minVariantPrice { amount currencyCode }
  }
  images(first: 10) {
    edges { node { url altText width height } }
  }
  variants(first: 50) {
    edges {
      node {
        id title sku
        price { amount }
        availableForSale
        selectedOptions { name value }
      }
    }
  }
  metafields(identifiers: [
    { namespace: "custom", key: "is_rx_capable" },
    { namespace: "custom", key: "frame_eye_size" },
    { namespace: "custom", key: "frame_bridge" },
    { namespace: "custom", key: "frame_temple_length" },
    { namespace: "custom", key: "polarized" },
    { namespace: "custom", key: "frame_shape" },
    { namespace: "custom", key: "frame_material" },
    { namespace: "custom", key: "lens_intent" },
    { namespace: "custom", key: "gender" }
  ]) { key value namespace }
`;

export const COLLECTIONS_QUERY = `
  query Collections($first: Int = 50) {
    collections(first: $first) {
      edges {
        node {
          id
          handle
          title
          description
          image { url altText width height }
        }
      }
    }
  }
`;

export const COLLECTION_PRODUCTS_QUERY = `
  query CollectionProducts(
    $handle: String!
    $first: Int!
    $after: String
    $filters: [ProductFilter!]
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image { url altText width height }
      products(first: $first, after: $after, filters: $filters, sortKey: $sortKey, reverse: $reverse) {
        filters {
          id
          label
          type
          values { id label count input }
        }
        pageInfo { hasNextPage endCursor }
        edges { node { ${PRODUCT_FIELDS} } }
      }
    }
  }
`;
```

- [ ] **Step 4: Implement mapping + fetchers in `src/lib/commerce/shopify.ts`**

1. Add `tags?: string[];` to the local `ShopifyNode` interface and `tags: node.tags || [],` inside `mapProduct` (after `title`).
2. Extend the import from `./shopify-storefront` with `COLLECTIONS_QUERY, COLLECTION_PRODUCTS_QUERY`; extend the type import from `./types` with `ShopifyCollection, CollectionProductsResult, ProductFilterInput, CatalogFacet`; add `import { filterValueParam } from './catalog-filters';`.
3. Append:

```ts
interface CollectionNode {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: ShopifyImage | null;
}

interface CollectionsResponse {
  collections: { edges: Array<{ node: CollectionNode }> };
}

interface FacetValueNode { id: string; label: string; count: number; input: unknown }
interface FacetNode { id: string; label: string; type: string; values: FacetValueNode[] }

interface CollectionProductsResponse {
  collection:
    | (CollectionNode & {
        products: {
          filters?: FacetNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          edges: Array<{ node: ShopifyNode }>;
        };
      })
    | null;
}

function mapCollection(node: CollectionNode): ShopifyCollection {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description || '',
    image: node.image ?? null,
  };
}

// The Storefront `input` scalar may serialize as a JSON string or an object.
function facetInputJson(input: unknown): string {
  return typeof input === 'string' ? input : JSON.stringify(input);
}

function mapFacets(filters: FacetNode[] | undefined): CatalogFacet[] {
  return (filters || []).map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    values: (f.values || []).map((v) => ({
      id: v.id,
      label: v.label,
      count: v.count,
      param: filterValueParam(facetInputJson(v.input)),
    })),
  }));
}

const EMPTY_COLLECTION_RESULT: CollectionProductsResult = {
  collection: null,
  products: [],
  facets: [],
  pageInfo: { hasNextPage: false, endCursor: null },
};

export async function getCollections(first = 50): Promise<ShopifyCollection[]> {
  try {
    const data = await storefrontFetch<CollectionsResponse>(COLLECTIONS_QUERY, { first });
    return data.collections.edges.map((e) => mapCollection(e.node));
  } catch (err) {
    if (allowMockFallback()) {
      console.warn('Shopify getCollections failed, using mock collection (non-production)', err);
      return [{ id: 'mock-collection-all', handle: 'all', title: 'All Frames', description: '', image: null }];
    }
    console.error('Shopify getCollections failed in production', err);
    return [];
  }
}

export async function getCollectionProducts(
  handle: string,
  opts: {
    filters?: ProductFilterInput[];
    sortKey?: string;
    reverse?: boolean;
    after?: string | null;
    first?: number;
  } = {},
): Promise<CollectionProductsResult> {
  try {
    const data = await storefrontFetch<CollectionProductsResponse>(COLLECTION_PRODUCTS_QUERY, {
      handle,
      first: opts.first ?? 24,
      after: opts.after ?? null,
      filters: opts.filters && opts.filters.length > 0 ? opts.filters : undefined,
      sortKey: opts.sortKey ?? 'COLLECTION_DEFAULT',
      reverse: opts.reverse ?? false,
    });
    if (!data.collection) return EMPTY_COLLECTION_RESULT;
    return {
      collection: mapCollection(data.collection),
      products: data.collection.products.edges.map((e) => mapProduct(e.node)),
      facets: mapFacets(data.collection.products.filters),
      pageInfo: {
        hasNextPage: data.collection.products.pageInfo.hasNextPage,
        endCursor: data.collection.products.pageInfo.endCursor ?? null,
      },
    };
  } catch (err) {
    if (allowMockFallback()) {
      console.warn('Shopify getCollectionProducts failed, using mock data (non-production)', err);
      return {
        collection: {
          id: `mock-collection-${handle}`,
          handle,
          title: handle === 'all' ? 'All Frames' : handle.replace(/-/g, ' '),
          description: '',
          image: null,
        },
        products: MOCK_PRODUCTS,
        facets: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    }
    console.error('Shopify getCollectionProducts failed in production', err);
    return EMPTY_COLLECTION_RESULT;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/commerce/collections.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the neighboring commerce suites (guard against regressions in the shared module)**

Run: `npx vitest run tests/lib/commerce/`
Expected: ALL PASS (`shopify.test.ts` and `mock-fallback.test.ts` mock the same storefront module — their mock factories may need the two new query name exports added; if they fail with "No export named COLLECTIONS_QUERY", add `COLLECTIONS_QUERY: ''` and `COLLECTION_PRODUCTS_QUERY: ''` to those mock factories).

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add src/lib/commerce/shopify-storefront.ts src/lib/commerce/shopify.ts tests/lib/commerce/collections.test.ts tests/lib/commerce/shopify.test.ts tests/lib/commerce/mock-fallback.test.ts
git commit -m "$(cat <<'EOF'
feat(catalog): collections data layer — getCollections + getCollectionProducts

COLLECTION_PRODUCTS_QUERY returns products + per-collection facets (Search &
Discovery) + cursor pageInfo in one query; facet input JSON normalized and
mapped to URL params via filterValueParam. tags now fetched on all product
queries. Dev-only mock fallback preserved; production errors return empty.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Card derivation — badges + color swatches (TDD)

**Files:**
- Create: `src/features/shop/catalog/card-data.ts`
- Test: `tests/features/shop/card-data.test.ts`

**Interfaces:**
- Consumes: `ShopifyProduct` (with `tags` from Task 2).
- Produces (used by Task 4):
  - `deriveBadges(p: ShopifyProduct): { id: string; label: string }[]` — ordered: `new` → "New", `bestseller` → "Bestseller", `polarized` → "Polarized", `rx` → "Rx Ready".
  - `deriveSwatches(p: ShopifyProduct): { name: string; hex: string }[]` — deduped Color option values in variant order.
  - `metafieldValue(p: ShopifyProduct, key: string): string | null` — `custom` namespace lookup.

- [ ] **Step 1: Write the failing tests**

Create `tests/features/shop/card-data.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/features/shop/card-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/shop/catalog/card-data.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/features/shop/card-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/features/shop/catalog/card-data.ts tests/features/shop/card-data.test.ts
git commit -m "$(cat <<'EOF'
feat(catalog): card badge + color-swatch derivation (pure, tested)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Upgrade `ProductCard` — hover image, swatches, badges

**Files:**
- Modify: `src/features/shop/ProductCard.tsx` (in place — the home page imports this path)

**Interfaces:**
- Consumes: `deriveBadges`, `deriveSwatches` (Task 3); `ShopifyProduct`.
- Produces: same default export `ProductCard({ product })` — signature unchanged, so `src/app/(site)/page.tsx` keeps working untouched.

- [ ] **Step 1: Replace `src/features/shop/ProductCard.tsx` with the upgraded card**

```tsx
import Link from 'next/link';
import Image from 'next/image';
import type { ShopifyProduct } from '@/lib/commerce/types';
import { deriveBadges, deriveSwatches } from '@/features/shop/catalog/card-data';

interface ProductCardProps {
  product: ShopifyProduct;
}

const MAX_BADGES = 2;
const MAX_SWATCHES = 4;

export default function ProductCard({ product }: ProductCardProps) {
  const image = product.images[0];
  const hoverImage = product.images[1];
  const price = Number(product.price).toFixed(0);
  const badges = deriveBadges(product).slice(0, MAX_BADGES);
  const swatches = deriveSwatches(product);
  const shownSwatches = swatches.slice(0, MAX_SWATCHES);
  const extraSwatches = swatches.length - shownSwatches.length;

  return (
    <Link
      href={`/p/${product.handle}`}
      className="group block border border-line rounded-xl overflow-hidden bg-white hover:border-accent hover:shadow-sm transition-all"
    >
      <div className="aspect-square bg-base-deeper flex items-center justify-center overflow-hidden relative">
        {image ? (
          <>
            <Image
              src={image.url}
              alt={image.altText || product.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={`object-cover transition-all duration-700 ${
                hoverImage ? 'group-hover:opacity-0' : 'group-hover:scale-105'
              }`}
            />
            {hoverImage && (
              <Image
                src={hoverImage.url}
                alt=""
                aria-hidden="true"
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
              />
            )}
          </>
        ) : (
          <div className="text-muted-soft font-serif italic text-sm">No image</div>
        )}

        {badges.length > 0 && (
          <div className="absolute bottom-3 left-3 flex gap-1.5">
            {badges.map((b) => (
              <span
                key={b.id}
                className="bg-white/90 backdrop-blur border border-line rounded px-2 py-0.5 shadow-sm font-mono text-[8px] font-bold text-accent uppercase tracking-wider"
              >
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col justify-between">
        <p className="font-sans text-xs font-bold text-ink uppercase tracking-wider truncate">
          {product.title}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-muted font-mono font-bold">
            ${price} {product.currencyCode}
          </p>
          <span className="text-[9px] text-muted-soft font-serif italic">frame only</span>
        </div>
        {shownSwatches.length > 0 && (
          <ul className="mt-2 flex items-center gap-1.5" aria-label="Available colors">
            {shownSwatches.map((s) => (
              <li
                key={s.name}
                title={s.name}
                className="w-3 h-3 rounded-full border border-line"
                style={{ backgroundColor: s.hex }}
              >
                <span className="sr-only">{s.name}</span>
              </li>
            ))}
            {extraSwatches > 0 && (
              <li className="text-[9px] text-muted-soft font-mono">+{extraSwatches}</li>
            )}
          </ul>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Verify with the suite, lint, and a smoke render**

Run: `npx vitest run tests/features/shop/ && npm run lint`
Expected: PASS + clean lint (derivation logic is covered by Task 3's tests; the card itself is exercised in the Task 10 visual pass).

- [ ] **Step 3: Commit**

```bash
git add src/features/shop/ProductCard.tsx
git commit -m "$(cat <<'EOF'
feat(catalog): richer product card — hover second image, badges, color swatches

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Filter UI client components — sidebar, sort, pills

**Files:**
- Create: `src/features/shop/catalog/FilterSidebar.tsx`
- Create: `src/features/shop/catalog/SortDropdown.tsx`
- Create: `src/features/shop/catalog/ActiveFilterPills.tsx`

**Interfaces:**
- Consumes: `CatalogFacet` type; `toggleFilterParam`, `setSingleParam`, `activeFilterEntries`, `SORT_OPTIONS` (Task 1).
- Produces (used by Tasks 6, 7):
  - `<FilterSidebar facets={CatalogFacet[]} />` (client; reads URL itself)
  - `<SortDropdown />` (client; reads URL itself)
  - `<ActiveFilterPills resultCount={number} hasNextPage={boolean} />` (client)

All three use `usePathname()` + `useSearchParams()` + `router.push(..., { scroll: false })`. URL logic is already unit-tested in Task 1 — these components only wire it to the DOM.

- [ ] **Step 1: Create `src/features/shop/catalog/FilterSidebar.tsx`**

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { CatalogFacet } from '@/lib/commerce/types';
import { toggleFilterParam, setSingleParam } from '@/lib/commerce/catalog-filters';

interface FilterSidebarProps {
  facets: CatalogFacet[];
}

function PriceControl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('price') ?? '';
  const [initMin, initMax] = current.split('-');
  const [min, setMin] = useState(initMin ?? '');
  const [max, setMax] = useState(initMax ?? '');

  function apply() {
    const value = min === '' && max === '' ? null : `${min}-${max}`;
    router.push(`${pathname}?${setSingleParam(searchParams.toString(), 'price', value)}`, { scroll: false });
  }

  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-soft">
        Min $
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="w-20 border border-line rounded-lg px-2 py-1.5 text-xs text-ink bg-white"
        />
      </label>
      <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-soft">
        Max $
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="w-20 border border-line rounded-lg px-2 py-1.5 text-xs text-ink bg-white"
        />
      </label>
      <button
        type="button"
        onClick={apply}
        className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent border border-accent rounded-lg px-3 py-1.5 hover:bg-accent/5 transition-colors"
      >
        Apply
      </button>
    </div>
  );
}

export default function FilterSidebar({ facets }: FilterSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  if (facets.length === 0) return null;

  return (
    <div className="space-y-2">
      {facets.map((facet) => {
        if (facet.type === 'PRICE_RANGE') {
          return (
            <details key={facet.id} open className="border-b border-line pb-4 pt-2">
              <summary className="cursor-pointer list-none font-mono text-[11px] font-bold uppercase tracking-widest text-ink py-2">
                {facet.label}
              </summary>
              <div className="pt-2">
                <PriceControl />
              </div>
            </details>
          );
        }

        const renderable = facet.values.filter((v) => v.param !== null);
        if (renderable.length === 0) return null;

        return (
          <details key={facet.id} open className="border-b border-line pb-4 pt-2">
            <summary className="cursor-pointer list-none font-mono text-[11px] font-bold uppercase tracking-widest text-ink py-2">
              {facet.label}
            </summary>
            <ul className="pt-1 space-y-1.5">
              {renderable.map((v) => {
                const { key, value } = v.param!;
                const active = searchParams.getAll(key).includes(value);
                return (
                  <li key={v.id}>
                    <label className="flex items-center gap-2 text-xs text-muted cursor-pointer hover:text-ink transition-colors">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() =>
                          router.push(`${pathname}?${toggleFilterParam(qs, key, value)}`, { scroll: false })
                        }
                        className="h-3.5 w-3.5 rounded border-line accent-current"
                      />
                      <span className={active ? 'font-bold text-ink' : ''}>{v.label}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-soft">{v.count}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/features/shop/catalog/SortDropdown.tsx`**

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SORT_OPTIONS, setSingleParam } from '@/lib/commerce/catalog-filters';

export default function SortDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('sort') ?? 'featured';

  return (
    <label className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-soft">
      Sort
      <select
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          router.push(
            `${pathname}?${setSingleParam(searchParams.toString(), 'sort', v === 'featured' ? null : v)}`,
            { scroll: false },
          );
        }}
        className="border border-line rounded-lg bg-white px-2 py-1.5 text-xs text-ink font-sans normal-case tracking-normal"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 3: Create `src/features/shop/catalog/ActiveFilterPills.tsx`**

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { activeFilterEntries, toggleFilterParam } from '@/lib/commerce/catalog-filters';

interface ActiveFilterPillsProps {
  resultCount: number;
  hasNextPage: boolean;
}

/** "m.custom.frame_shape" -> "Frame shape", "opt.size" -> "Size", "vendor" -> "Brand" */
function labelForKey(key: string): string {
  if (key === 'vendor') return 'Brand';
  if (key === 'ptype') return 'Type';
  if (key === 'tag') return 'Tag';
  if (key === 'available') return 'In stock';
  if (key === 'price') return 'Price';
  const raw = key.startsWith('opt.') ? key.slice(4) : key.startsWith('m.') ? key.split('.').slice(2).join('.') : key;
  const words = raw.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function ActiveFilterPills({ resultCount, hasNextPage }: ActiveFilterPillsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const entries = activeFilterEntries(qs).concat(
    searchParams.get('price') ? [{ key: 'price', value: searchParams.get('price')! }] : [],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 min-h-8">
      {entries.map(({ key, value }) => (
        <button
          key={`${key}=${value}`}
          type="button"
          onClick={() =>
            router.push(
              `${pathname}?${key === 'price' ? toggleFilterParam(qs.replace(/(^|&)price=[^&]*/, '$1').replace(/^&/, ''), '', '') && new URLSearchParams(qs).toString() : ''}`,
              { scroll: false },
            )
          }
          className="inline-flex items-center gap-1.5 border border-line rounded-full bg-white px-3 py-1 text-[11px] text-ink hover:border-accent transition-colors"
        >
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-soft">{labelForKey(key)}:</span>
          {value}
          <span aria-hidden="true">×</span>
          <span className="sr-only">Remove filter {labelForKey(key)} {value}</span>
        </button>
      ))}
      {entries.length > 0 && (
        <button
          type="button"
          onClick={() => router.push(pathname, { scroll: false })}
          className="text-[11px] font-mono font-bold uppercase tracking-wider text-accent hover:underline"
        >
          Clear all
        </button>
      )}
      <span className="ml-auto text-xs text-muted-soft font-serif italic">
        Showing {resultCount}
        {hasNextPage ? '+' : ''} models
      </span>
    </div>
  );
}
```

**Correction to the pill remove handler (the above onClick for price is wrong — use this exact implementation):**

```tsx
function removeEntry(key: string, value: string) {
  const next =
    key === 'price'
      ? setSingleParam(qs, 'price', null)
      : toggleFilterParam(qs, key, value);
  router.push(`${pathname}?${next}`, { scroll: false });
}
```

Import `setSingleParam` alongside the other helpers, call `removeEntry(key, value)` from each pill's `onClick`, and note `activeFilterEntries` already excludes only `sort`/`after`/`quiz`, so `price` pills come through `activeFilterEntries` directly — **do not** concat a second price entry. Final component logic: `const entries = activeFilterEntries(qs);` and pills call `removeEntry`.

- [ ] **Step 4: Verify lint + types**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean. (Behavior of every URL mutation these components perform is covered by Task 1's tests.)

- [ ] **Step 5: Commit**

```bash
git add src/features/shop/catalog/FilterSidebar.tsx src/features/shop/catalog/SortDropdown.tsx src/features/shop/catalog/ActiveFilterPills.tsx
git commit -m "$(cat <<'EOF'
feat(catalog): dynamic filter sidebar, sort dropdown, active-filter pills

Sidebar renders whatever facets the Storefront API returns (LIST checkboxes
with counts, PRICE_RANGE min/max control); all state changes are URL pushes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Grid, skeleton, mobile drawer, Load More (+ server action)

**Files:**
- Create: `src/features/shop/catalog/ProductGrid.tsx`
- Create: `src/features/shop/catalog/GridSkeleton.tsx`
- Create: `src/features/shop/catalog/FilterDrawer.tsx`
- Create: `src/features/shop/catalog/load-more-action.ts`
- Create: `src/features/shop/catalog/LoadMore.tsx`
- Test: `tests/features/shop/load-more-action.test.ts`

**Interfaces:**
- Consumes: `getCollectionProducts` (Task 2), `parseCatalogSearchParams`, `withAfter` (Task 1), `ProductCard` (Task 4).
- Produces (used by Task 7):
  - `<ProductGrid products={ShopifyProduct[]} />`
  - `<GridSkeleton count?: number />`
  - `<FilterDrawer activeCount={number}>{children}</FilterDrawer>` (mobile-only wrapper)
  - `<LoadMore collectionHandle={string} queryString={string} initialPageInfo={CatalogPageInfo} />`
  - server action `loadMoreProducts(handle: string, queryString: string): Promise<{ products: ShopifyProduct[]; pageInfo: CatalogPageInfo }>`

- [ ] **Step 1: Write the failing server-action test**

Create `tests/features/shop/load-more-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetCollectionProducts = vi.fn();
vi.mock('@/lib/commerce/shopify', () => ({
  getCollectionProducts: mockGetCollectionProducts,
}));

beforeEach(() => mockGetCollectionProducts.mockReset());

describe('loadMoreProducts server action', () => {
  it('parses the query string (incl. repeated filters + after) and fetches the next page', async () => {
    mockGetCollectionProducts.mockResolvedValueOnce({
      collection: { id: 'c', handle: 'all', title: 'All', description: '', image: null },
      products: [{ id: 'p2' }],
      facets: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    const { loadMoreProducts } = await import('@/features/shop/catalog/load-more-action');
    const res = await loadMoreProducts('all', 'vendor=A&vendor=B&sort=price-asc&after=CUR');

    expect(mockGetCollectionProducts).toHaveBeenCalledWith('all', {
      filters: [{ productVendor: 'A' }, { productVendor: 'B' }],
      sortKey: 'PRICE',
      reverse: false,
      after: 'CUR',
    });
    expect(res.products).toEqual([{ id: 'p2' }]);
    expect(res.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it('rejects malformed handles and oversized query strings without fetching', async () => {
    const { loadMoreProducts } = await import('@/features/shop/catalog/load-more-action');
    expect(await loadMoreProducts('NOT_A_HANDLE!', 'x=1')).toEqual({
      products: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    expect(await loadMoreProducts('all', 'a'.repeat(3000))).toEqual({
      products: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    expect(mockGetCollectionProducts).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/shop/load-more-action.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/shop/catalog/load-more-action.ts`**

```ts
'use server';

import { getCollectionProducts } from '@/lib/commerce/shopify';
import { parseCatalogSearchParams } from '@/lib/commerce/catalog-filters';
import type { CatalogPageInfo, SearchParamsRecord, ShopifyProduct } from '@/lib/commerce/types';

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{0,254}$/;
const MAX_QS_LENGTH = 2000;

const EMPTY: { products: ShopifyProduct[]; pageInfo: CatalogPageInfo } = {
  products: [],
  pageInfo: { hasNextPage: false, endCursor: null },
};

/**
 * Public storefront pagination. Input is attacker-controllable, so validate
 * shape/size before touching the commerce layer (matches the project's
 * defensive server-action posture even for unauthenticated reads).
 */
export async function loadMoreProducts(
  handle: string,
  queryString: string,
): Promise<{ products: ShopifyProduct[]; pageInfo: CatalogPageInfo }> {
  if (!HANDLE_RE.test(handle) || queryString.length > MAX_QS_LENGTH) return EMPTY;

  const usp = new URLSearchParams(queryString);
  const sp: SearchParamsRecord = {};
  for (const key of new Set(usp.keys())) {
    const all = usp.getAll(key);
    sp[key] = all.length > 1 ? all : all[0];
  }

  const q = parseCatalogSearchParams(sp);
  const res = await getCollectionProducts(handle, {
    filters: q.filters,
    sortKey: q.sortKey,
    reverse: q.reverse,
    after: q.after,
  });
  return { products: res.products, pageInfo: res.pageInfo };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/shop/load-more-action.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the three presentational components**

`src/features/shop/catalog/ProductGrid.tsx`:

```tsx
import type { ShopifyProduct } from '@/lib/commerce/types';
import ProductCard from '@/features/shop/ProductCard';

interface ProductGridProps {
  products: ShopifyProduct[];
}

export default function ProductGrid({ products }: ProductGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 animate-fade-in-up">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
```

`src/features/shop/catalog/GridSkeleton.tsx`:

```tsx
interface GridSkeletonProps {
  count?: number;
}

export default function GridSkeleton({ count = 12 }: GridSkeletonProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-line rounded-xl overflow-hidden bg-white">
          <div className="aspect-square bg-base-deeper animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-3 w-3/4 bg-base-deeper rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-base-deeper rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

`src/features/shop/catalog/FilterDrawer.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface FilterDrawerProps {
  activeCount: number;
  children: ReactNode;
}

/** Mobile-only bottom sheet wrapping the filter sidebar. */
export default function FilterDrawer({ activeCount, children }: FilterDrawerProps) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink border border-line rounded-lg px-4 py-2 hover:border-accent transition-colors"
      >
        Filters{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40 w-full h-full cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="absolute bottom-0 inset-x-0 max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl border-t border-line p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-ink">Filters</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-mono font-bold uppercase tracking-wider text-accent"
              >
                Done
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `src/features/shop/catalog/LoadMore.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { CatalogPageInfo, ShopifyProduct } from '@/lib/commerce/types';
import { withAfter } from '@/lib/commerce/catalog-filters';
import { loadMoreProducts } from '@/features/shop/catalog/load-more-action';
import ProductGrid from '@/features/shop/catalog/ProductGrid';

interface LoadMoreProps {
  collectionHandle: string;
  queryString: string;
  initialPageInfo: CatalogPageInfo;
}

export default function LoadMore({ collectionHandle, queryString, initialPageInfo }: LoadMoreProps) {
  const [pages, setPages] = useState<ShopifyProduct[][]>([]);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [loading, setLoading] = useState(false);

  if (!pageInfo.hasNextPage && pages.length === 0) return null;

  async function onLoadMore() {
    if (!pageInfo.endCursor) return;
    setLoading(true);
    try {
      const res = await loadMoreProducts(collectionHandle, withAfter(queryString, pageInfo.endCursor));
      setPages((prev) => [...prev, res.products]);
      setPageInfo(res.pageInfo);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {pages.map((products, i) => (
        <ProductGrid key={i} products={products} />
      ))}
      {pageInfo.hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="text-xs font-mono font-bold uppercase tracking-wider text-accent border border-accent rounded-lg px-6 py-2.5 hover:bg-accent/5 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
          <noscript>
            {pageInfo.endCursor && (
              <a href={`?${withAfter(queryString, pageInfo.endCursor)}`} rel="nofollow" className="text-xs text-accent underline ml-3">
                Next page
              </a>
            )}
          </noscript>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
git add src/features/shop/catalog/ProductGrid.tsx src/features/shop/catalog/GridSkeleton.tsx src/features/shop/catalog/FilterDrawer.tsx src/features/shop/catalog/LoadMore.tsx src/features/shop/catalog/load-more-action.ts tests/features/shop/load-more-action.test.ts
git commit -m "$(cat <<'EOF'
feat(catalog): grid, skeleton, mobile filter drawer, cursor Load More

Load More is a validated public server action (handle regex + query-string
size cap) that reuses the same URL contract; no-JS fallback via ?after link.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The PLP route — `/shop/[collection]` with metadata + JSON-LD

**Files:**
- Create: `src/features/shop/catalog/Breadcrumbs.tsx`
- Create: `src/app/(site)/shop/[collection]/page.tsx`
- Create: `src/app/(site)/shop/[collection]/loading.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1–6, plus `getProducts` (existing) for the `all`-fallback.
- Produces: the public PLP route.

- [ ] **Step 1: Create `src/features/shop/catalog/Breadcrumbs.tsx`**

```tsx
import Link from 'next/link';

interface Crumb {
  label: string;
  href?: string;
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[11px] font-mono uppercase tracking-wider text-muted-soft">
      <ol className="flex items-center gap-2">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-accent transition-colors">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink font-bold">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 2: Create `src/app/(site)/shop/[collection]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getCollectionProducts, getProducts } from '@/lib/commerce/shopify';
import { parseCatalogSearchParams, activeFilterEntries } from '@/lib/commerce/catalog-filters';
import type { CollectionProductsResult, SearchParamsRecord } from '@/lib/commerce/types';
import Breadcrumbs from '@/features/shop/catalog/Breadcrumbs';
import FilterSidebar from '@/features/shop/catalog/FilterSidebar';
import FilterDrawer from '@/features/shop/catalog/FilterDrawer';
import SortDropdown from '@/features/shop/catalog/SortDropdown';
import ActiveFilterPills from '@/features/shop/catalog/ActiveFilterPills';
import ProductGrid from '@/features/shop/catalog/ProductGrid';
import LoadMore from '@/features/shop/catalog/LoadMore';
import Link from 'next/link';

export const revalidate = 900;

interface PlpProps {
  params: Promise<{ collection: string }>;
  searchParams: Promise<SearchParamsRecord>;
}

/** Rebuild the canonical query string from searchParams (order-stable enough for cache keying). */
function toQueryString(sp: SearchParamsRecord): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const value of Array.isArray(v) ? v : v !== undefined ? [v] : []) p.append(k, value);
  }
  return p.toString();
}

// cache() dedupes the generateMetadata + page fetch for identical primitive args.
const getPlpData = cache(async (handle: string, qs: string): Promise<CollectionProductsResult> => {
  const sp: SearchParamsRecord = {};
  const usp = new URLSearchParams(qs);
  for (const key of new Set(usp.keys())) {
    const all = usp.getAll(key);
    sp[key] = all.length > 1 ? all : all[0];
  }
  const q = parseCatalogSearchParams(sp);
  return getCollectionProducts(handle, {
    filters: q.filters,
    sortKey: q.sortKey,
    reverse: q.reverse,
    after: q.after,
  });
});

export async function generateMetadata({ params, searchParams }: PlpProps) {
  const { collection } = await params;
  const qs = toQueryString(await searchParams);
  const res = await getPlpData(collection, qs);
  const title = res.collection?.title ?? 'Shop';
  return {
    title,
    description:
      res.collection?.description || `Browse ${title} — GlassyVision frames, hand-finished in India.`,
  };
}

export default async function CollectionPage({ params, searchParams }: PlpProps) {
  const { collection: handle } = await params;
  const sp = await searchParams;
  const qs = toQueryString(sp);

  let res = await getPlpData(handle, qs);

  // "all" works even before the merchant creates an automated all-collection:
  // fall back to the plain product list (no facets) rather than 404ing.
  if (!res.collection && handle === 'all') {
    const products = await getProducts(48);
    res = {
      collection: { id: 'virtual-all', handle: 'all', title: 'All Frames', description: '', image: null },
      products,
      facets: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    };
  }

  if (!res.collection) notFound();

  const activeCount = activeFilterEntries(qs).length;
  const hasProducts = res.products.length > 0;

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: res.collection.title,
    itemListElement: res.products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `/p/${p.handle}`,
      name: p.title,
    })),
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <header className="space-y-3">
        <Breadcrumbs
          items={[{ label: 'Home', href: '/' }, { label: 'Shop', href: '/shop' }, { label: res.collection.title }]}
        />
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink">
          {res.collection.title}
        </h1>
        {res.collection.description && (
          <p className="text-sm text-muted max-w-2xl">{res.collection.description}</p>
        )}
      </header>

      <div className="border-y border-line py-3 my-8 flex items-center justify-between gap-4">
        <FilterDrawer activeCount={activeCount}>
          <FilterSidebar facets={res.facets} />
        </FilterDrawer>
        <div className="ml-auto">
          <SortDropdown />
        </div>
      </div>

      <div className="flex gap-10">
        <aside className="hidden lg:block w-60 shrink-0" aria-label="Product filters">
          <FilterSidebar facets={res.facets} />
        </aside>

        <main className="flex-1 space-y-6 min-w-0">
          <ActiveFilterPills resultCount={res.products.length} hasNextPage={res.pageInfo.hasNextPage} />

          {hasProducts ? (
            <>
              <ProductGrid products={res.products} />
              <LoadMore
                collectionHandle={res.collection.handle}
                queryString={qs}
                initialPageInfo={res.pageInfo}
              />
            </>
          ) : (
            <div className="border border-dashed border-line rounded-xl p-16 text-center bg-white">
              <p className="font-serif italic text-muted text-lg">No frames match these filters.</p>
              <p className="text-xs text-muted-soft mt-2">
                <Link href={`/shop/${res.collection.handle}`} className="text-accent underline font-bold">
                  Clear all filters
                </Link>{' '}
                or browse the{' '}
                <Link href="/shop" className="text-accent underline font-bold">
                  full collection list
                </Link>
                .
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/(site)/shop/[collection]/loading.tsx`**

```tsx
import GridSkeleton from '@/features/shop/catalog/GridSkeleton';

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="h-10 w-64 bg-base-deeper rounded animate-pulse mb-10" />
      <GridSkeleton count={12} />
    </div>
  );
}
```

- [ ] **Step 4: Verify lint + types + suite**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all clean/green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(site)/shop/[collection]" src/features/shop/catalog/Breadcrumbs.tsx
git commit -m "$(cat <<'EOF'
feat(catalog): /shop/[collection] PLP — facets, sort, pills, load-more, JSON-LD

Server component; URL is the filter state; React cache() dedupes the
metadata+page fetch; /shop/all falls back to the plain product list until an
automated all-collection exists; unknown handles 404.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `/shop` landing — category tiles + legacy-param redirect

**Files:**
- Create: `src/features/shop/catalog/CategoryTiles.tsx`
- Modify: `src/app/(site)/shop/page.tsx` (full rewrite)
- Delete: `tests/features/shop/shop-filtering.test.ts` (tests the removed name-guessing filter logic; its scenarios are superseded by `catalog-filters.test.ts` legacy-mapping coverage)

**Interfaces:**
- Consumes: `getCollections` (Task 2), `mapLegacyShopParams` (Task 1).
- Produces: the `/shop` landing route.

- [ ] **Step 1: Create `src/features/shop/catalog/CategoryTiles.tsx`**

```tsx
import Link from 'next/link';
import Image from 'next/image';
import type { ShopifyCollection } from '@/lib/commerce/types';

interface CategoryTilesProps {
  collections: ShopifyCollection[];
}

export default function CategoryTiles({ collections }: CategoryTilesProps) {
  const tiles = [
    { id: 'virtual-all', handle: 'all', title: 'All Frames', description: 'The complete collection', image: null },
    ...collections.filter((c) => c.handle !== 'all'),
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {tiles.map((c) => (
        <Link
          key={c.id}
          href={`/shop/${c.handle}`}
          className="group relative block aspect-[4/3] border border-line rounded-xl overflow-hidden bg-base-deeper hover:border-accent transition-all"
        >
          {c.image ? (
            <Image
              src={c.image.url}
              alt=""
              aria-hidden="true"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover group-hover:scale-105 transition-transform duration-700"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-soft font-serif italic text-sm">
              GlassyVision
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur border-t border-line p-4">
            <p className="font-sans text-sm font-black uppercase tracking-wider text-ink">{c.title}</p>
            {c.description && (
              <p className="text-xs text-muted-soft mt-0.5 line-clamp-1">{c.description}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/app/(site)/shop/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getCollections } from '@/lib/commerce/shopify';
import { mapLegacyShopParams } from '@/lib/commerce/catalog-filters';
import type { SearchParamsRecord } from '@/lib/commerce/types';
import CategoryTiles from '@/features/shop/catalog/CategoryTiles';

export const revalidate = 900;

export const metadata = {
  title: 'Shop',
  description: 'All GlassyVision frames, hand-finished in India — browse by category.',
};

interface ShopPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const sp = await searchParams;

  // Legacy deep links (quiz results, old bookmarks) land on the new catalog.
  if (sp.shape || sp.size || sp.style || sp.sun || sp.quiz) {
    const qs = mapLegacyShopParams(sp);
    redirect(qs ? `/shop/all?${qs}` : '/shop/all');
  }

  const collections = await getCollections();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <header>
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft">Shop Collection</p>
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink">Browse by category</h1>
        <p className="text-sm text-muted mt-2 max-w-2xl">
          Categories are curated in real time — every tile below is live from our catalog.
        </p>
      </header>

      <div className="mt-10">
        <CategoryTiles collections={collections} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete the obsolete test and verify**

```bash
git rm tests/features/shop/shop-filtering.test.ts
npm run lint && npx tsc --noEmit && npm test
```
Expected: lint clean, types clean, full suite green (the deleted file's behaviors are covered by `catalog-filters.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/shop/page.tsx" src/features/shop/catalog/CategoryTiles.tsx
git commit -m "$(cat <<'EOF'
feat(catalog): /shop category-tile landing + legacy param redirect

/shop now lists live collections as tiles (All Frames first); old
?shape/size/sun/quiz deep links 302 to /shop/all on the new contract. Removes
the obsolete name-guessing filter test.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Quiz → new catalog URL (TDD)

**Files:**
- Modify: `src/app/(site)/quiz/page.tsx:272-283` (the answer-mapping block inside `selectOption`)
- Test: `tests/features/shop/quiz-mapping.test.ts`

**Interfaces:**
- Consumes: `buildQuizShopUrl` (Task 1).
- Produces: quiz results land on `/shop/all?…` with real facet params.

- [ ] **Step 1: Write the failing test**

Create `tests/features/shop/quiz-mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildQuizShopUrl } from '@/lib/commerce/catalog-filters';

describe('quiz -> catalog integration', () => {
  it('quiz page delegates to buildQuizShopUrl (no legacy /shop?shape= push left behind)', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(site)/quiz/page.tsx'), 'utf8');
    expect(src).toContain('buildQuizShopUrl');
    expect(src).not.toContain('/shop?shape=');
  });

  it('every face shape produces a valid /shop/all URL', () => {
    for (const shape of ['oval', 'square', 'heart', 'diamond', 'round']) {
      const url = buildQuizShopUrl({ shape, size: 'm', intent: 'rx_clear' });
      expect(url.startsWith('/shop/all?')).toBe(true);
      expect(url).toContain('quiz=true');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/shop/quiz-mapping.test.ts`
Expected: FAIL — quiz page does not contain `buildQuizShopUrl`.

- [ ] **Step 3: Edit the quiz**

In `src/app/(site)/quiz/page.tsx`, add the import at the top:

```ts
import { buildQuizShopUrl } from '@/lib/commerce/catalog-filters';
```

Replace the mapping block in `selectOption` (currently lines 272–283, from `// Map answers to query parameters for /shop` through the `router.push(...)` call) with:

```ts
      router.push(buildQuizShopUrl(nextAnswers));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/features/shop/quiz-mapping.test.ts && npm test`
Expected: PASS, full suite green.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add "src/app/(site)/quiz/page.tsx" tests/features/shop/quiz-mapping.test.ts
git commit -m "$(cat <<'EOF'
feat(catalog): quiz results land on the dynamic catalog filters

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Verification sweep, visual pass, merchant setup + review

**Files:**
- No new code (fixes only, if the sweep finds any).

- [ ] **Step 1: Full verification**

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```
Expected: lint clean, types clean, **all tests green**, production build compiles. Fix anything that fails before proceeding.

- [ ] **Step 2: Seed one real collection in the dev store (merchant-side, via Admin API or Shopify admin)**

In the Shopify admin (`glassyvision-o9b6utgq.myshopify.com`): Products → Collections → **Create collection** "All Frames" with handle `all`, automated condition "Product price > $0" (matches everything). Optionally a second collection `sunglasses` (condition: product tag `sunglasses`; tag the Dusk Wayfarer). Without this step `/shop/all` still works via the fallback; with it, facets appear.

- [ ] **Step 3: Visual pass on the running dev server**

```bash
npm run dev
```
Then verify in the browser (screenshots for the user):
1. `http://localhost:3000/shop` → category tiles render (All Frames + any created collections).
2. `http://localhost:3000/shop/all` → grid shows the seeded products; sort dropdown reorders by price; if Search & Discovery filters are configured, sidebar facets render with counts; toggling a checkbox updates the URL and the grid.
3. `http://localhost:3000/shop?sun=true` → 302s to `/shop/all?m.custom.lens_intent=sunglasses`.
4. Complete the quiz → lands on `/shop/all?...&quiz=true`.
5. Mobile viewport → "Filters" button opens the bottom sheet; Escape/Done closes it.
6. Unknown collection `http://localhost:3000/shop/does-not-exist` → 404 page.

- [ ] **Step 4: Merchant setup runbook (tell the founder — no code)**

Post-build Shopify checklist (from spec §13): (1) install **Search & Discovery** (free) and add filters (price, availability, vendor, the `custom.*` metafields); (2) create metafield definitions for `frame_shape`, `frame_material`, `lens_intent`, `polarized`, `gender` (Settings → Custom data → Products, values per spec §5) and fill them on each product; (3) create the real category collections. Facets appear on the site automatically as each step lands.

- [ ] **Step 5: Final commit + external code review**

```bash
git add -A && git status   # confirm nothing unexpected
git commit -m "$(cat <<'EOF'
chore(catalog): verification sweep — lint, types, tests, build green
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"   # only if the sweep produced fixes
```
Then, per CLAUDE.md, dispatch an external `code-review` (or `feature-dev:code-reviewer`) subagent over the whole `feature/dynamic-catalog` branch diff before merge. Address findings; do not merge unreviewed.

---

## Self-review notes (spec ↔ plan)

- Spec §5 taxonomy: plan queries the metafields the UI consumes (badges/facets); the *full* recommended taxonomy (`rim_type`, `lens_features`, `face_shape_fit`, …) needs **no code** — S&D facets flow through the generic facet renderer; only `PRODUCT_FIELDS` lists what cards read directly. ✔
- Spec §8.5 features: tiles (T8), breadcrumbs (T7), sidebar+drawer+pills+sort (T5/T6/T7), richer cards (T3/T4), load-more+skeleton (T6/T7), SEO metadata+JSON-LD (T7). Category-tile product **count** dropped — the Storefront API exposes no cheap per-collection count (deliberate deviation, noted). ✔
- Spec §9 quiz (T9), §10 error/empty states (T7 `notFound`/empty-state/`all`-fallback; T2 prod-empty), §11 tests (T1/T2/T3/T6/T9). ✔
- Type/name consistency verified across tasks: `CatalogFacet.param`, `getCollectionProducts` opts, `withAfter`, `loadMoreProducts` signature match everywhere. ✔
