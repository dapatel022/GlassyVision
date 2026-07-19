# GlassyVision — Dynamic Catalog (Category Pages + Faceted Filters) Design

- **Status:** Approved in principle (brainstorm complete 2026-07-18). Ready for implementation plan.
- **Date:** 2026-07-18
- **References (best-in-class eyewear PLPs, borrow the strongest of each):** Sunglass Hut (brand + polarized + lens-tech facets), Warby Parker (clean cards, color swatches, width/fit facets, try-on entry), Ray-Ban (hover colorways), Zenni & EyeBuyDirect (deep facet sets — shape/material/rim/size/features), Glasses.com (face-shape guidance + virtual try-on). Not a clone of any one — a superset.
- **Relates to:** `2026-04-11-glassyvision-phase1-design.md` (headless architecture; Shopify as commerce black box), the existing `src/app/(site)/shop/page.tsx`.
- **Why this doc exists:** The founder wants the storefront to be **fully dynamic — nothing hardcoded.** That ambition is three separate systems (see §2). This spec covers **only sub-project A: the dynamic catalog.** B (dynamic navigation) and C (editable homepage content) are recorded in §12 as follow-ups, each getting its own spec → plan → build.

---

## 1. Problem

Today `src/app/(site)/shop/page.tsx`:
- Fetches **all** products (`getProducts(48)`) — no concept of categories/collections.
- Filters are **hardcoded** and **guess attributes from the product name** — e.g. `title.includes('sun')`, `title.includes('small')`. Fragile and wrong the moment a product is named differently.
- Filter options (Lens Intent, Size) are **hardcoded `<Link>`s** in JSX.
- No brand / color / material / polarized / price filters, no sort, no pagination.

There are **no Shopify Collections** used anywhere (`getCollections` does not exist in `src/lib/commerce/`).

## 2. Scope

| Sub-project | This spec | Status |
|---|---|---|
| **A — Dynamic catalog** (category pages + faceted filters + sort + pagination) | ✅ **YES** | designed here |
| B — Dynamic navigation (menu auto-built from collections) | ❌ follow-up | §12 |
| C — Editable homepage/content (hero, ticker, featured rows) | ❌ follow-up | §12 |

## 3. Approach decision

**Chosen: Shopify-native filtering (Collections + Search & Discovery).** Rejected alternatives: a custom in-app filter engine (re-implements what Shopify gives free; needs a bespoke admin UI; more code to maintain) and a hybrid fixed-filter set (filters not fully merchant-self-serve).

Rationale — it is the only option that satisfies "nothing hardcoded" end-to-end, and it fits the locked architecture (Shopify is the commerce black box; all Shopify calls stay in `src/lib/commerce/shopify.ts`):
- **Categories** = Shopify **Collections** (merchant-created; manual or automated-by-rules).
- **Facets** = configured once in Shopify's free first-party **Search & Discovery** app; the Storefront API then returns the **available filters per collection** at query time. Add/remove a filter in Shopify → it appears/disappears on the site with no code change.
- **Filtering + sorting + pagination execute server-side inside Shopify** (not client-side text matching), so it scales and the facet **counts** are correct.

## 4. Architecture keystones

### Keystone 1 — The Storefront API returns the facets; the UI is generated from them
Query `collection(handle){ products(first, filters, sortKey, reverse, after) }`. The returned `ProductConnection.filters` is a list of `Filter { id, label, type, values { id, label, count, input } }`. **The filter sidebar is rendered from this response** — never from a hardcoded list. Each value carries an opaque `input` (a JSON string) that we echo back in the `filters:` argument to apply it. This is the entire "dynamic" mechanism.

### Keystone 2 — URL is the single source of filter state
All active filters + sort + page live in the query string, e.g. `/shop/mens-sunglasses?frame_shape=round&color=black&sort=price-asc`. The page is a **server component** that reads `searchParams`, translates them into Storefront `ProductFilter` inputs, and fetches. Benefits: shareable/bookmarkable, SEO-indexable, back-button correct, and no client data-fetching library needed. A thin client component only updates the URL when a checkbox toggles.

## 5. Data model

### Shopify side (merchant-managed, no code)
- **Collections** — one per category (e.g. `mens-sunglasses`, `optical`, `titanium`, `new-arrivals`). Handle drives the route. `title`, `description`, `image` render the category header.
- **Metafield taxonomy** (product-level, namespace `custom`, each needs a **definition** with Storefront access + "filterable" enabled in Search & Discovery). Recommended full eyewear facet set, drawn from the reference PLPs:
  - `frame_shape` (list: round / square / rectangle / aviator / cat-eye / oval / geometric / browline / wayfarer)
  - `frame_material` (list: acetate / titanium / metal / mixed / TR90 / eco)
  - `rim_type` (full-rim / semi-rimless / rimless)
  - `frame_width` / fit (narrow / medium / wide) — derivable from `frame_eye_size`
  - `frame_color` (list) and `lens_color` (list)
  - `gender` (mens / womens / unisex / kids)
  - `lens_intent` (clear-rx / sunglasses / blue-light)
  - `polarized` (boolean)
  - `lens_features` (list: anti-reflective / photochromic / mirrored / high-index)
  - `face_shape_fit` (list: round / oval / square / heart — for the "best for your face shape" facet)
  - existing: `is_rx_capable`, `frame_eye_size`, `frame_bridge`, `frame_temple_length`
- **Native facets** (no metafield needed): **price** range, **availability** (in stock), product **vendor** (= brand), **product type**, **variant options** (Color / Size), **tags** (drives `New`, `Bestseller`, `Limited` badges + collections).

> The site renders **whatever facets Shopify returns** — the list above is the recommended starting set, but it is chosen in Search & Discovery, not in code. Adding/removing a facet later is a Shopify-only action. "As many as make sense" is a config decision, not a code change.

### Our side (Supabase)
**None.** This sub-project is storefront-read-only. It does not touch orders, Rx, lab, inventory, or auth.

## 6. Routes & components (Next.js, App Router)

```
src/app/(site)/shop/
  page.tsx                 # landing: category tiles (all collections) + "All frames"
  [collection]/page.tsx    # NEW — a category PLP for one collection handle
src/features/shop/
  catalog/
    CategoryTiles.tsx      # NEW — /shop landing: tile per collection (image+title+count)
    Breadcrumbs.tsx        # NEW — Home / Shop / <Collection>
    FilterSidebar.tsx      # NEW client — renders facet groups from API (multi-select +
                           #   counts + price slider + collapsible groups); toggles update URL
    FilterDrawer.tsx       # NEW client — mobile bottom-sheet wrapper around FilterSidebar
    SortDropdown.tsx       # NEW client — sort control; updates URL
    ActiveFilterPills.tsx  # NEW client — removable chips + result count + "Clear all"
    ProductGrid.tsx        # NEW — responsive grid of ProductCard
    ProductCard.tsx        # UPGRADE existing — hover second image, color swatches from
                           #   variants, badges (New / Bestseller / Polarized / Rx-ready),
                           #   quick "Try on" entry (reuse existing VirtualTryOn)
    LoadMore.tsx           # NEW client — cursor pagination ("Load more" + no-JS ?after= fallback)
    GridSkeleton.tsx       # NEW — loading skeleton
src/lib/commerce/
  shopify.ts               # EXTEND — add getCollections(), getCollection(handle),
                           #          getCollectionProducts(handle, {filters, sort, cursor})
  shopify-storefront.ts    # EXTEND — add COLLECTION_QUERY, COLLECTIONS_QUERY,
                           #          COLLECTION_PRODUCTS_QUERY (with filters/sortKey/after)
  catalog-filters.ts       # NEW — pure functions: searchParams <-> ProductFilter[],
                           #        sort param <-> {sortKey, reverse}. Unit-tested.
```

All new Shopify GraphQL stays behind `src/lib/commerce/` per the lock-in rule. The `[collection]` page reuses the existing `revalidate = 900` caching posture.

## 7. Data flow

1. Customer opens `/shop/mens-sunglasses?frame_shape=round&sort=price-asc`.
2. Server component reads `params.collection` + `searchParams`.
3. `catalog-filters.ts` maps `searchParams` → `{ collectionHandle, filters: ProductFilter[], sortKey, reverse, after }`.
4. `getCollectionProducts()` runs one Storefront GraphQL query → `{ products[], availableFilters[], pageInfo }`.
5. Page renders: collection header + `FilterSidebar(availableFilters)` + `SortDropdown` + `ActiveFilterPills` + `ProductGrid(products)` + `LoadMore(pageInfo)`.
6. Toggling a filter/sort **navigates** to a new URL (same page, new query string) → re-fetch. "Load more" fetches the next cursor page and appends (client), or is a `?after=` link fallback.

## 8. Filtering / sorting / pagination mechanics

- **Filters:** pass the facet value's opaque `input` JSON back in `products(filters: [...])`. We never hand-build filter JSON except for price range (`{price:{min,max}}`), which is well-documented.
- **Sort:** map UI values → Storefront `ProductCollectionSortKeys` + `reverse`: `featured`→`COLLECTION_DEFAULT`, `price-asc`→`PRICE`, `price-desc`→`PRICE`+reverse, `newest`→`CREATED`+reverse, `best-selling`→`BEST_SELLING`, `title`→`TITLE`.
- **Pagination:** cursor-based (`first: 24, after: endCursor`), `pageInfo{ hasNextPage, endCursor }`. Default page size 24.

## 8.5 PLP experience feature set (best-in-class)

Included in this build (all powered by the same dynamic data, no hardcoding):
- **`/shop` category landing** — tiles for every collection (image, title, product count) + an "All frames" tile.
- **Breadcrumbs** on category pages.
- **Faceted filter sidebar** — collapsible groups, **multi-select**, **live result counts** per value, a **price range** control, color **swatch** facets. Rendered entirely from the API's facet list.
- **Mobile filter drawer** — the sidebar as a bottom sheet with an "Apply (N)" button.
- **Active-filter pills** — removable chips, total **result count**, "Clear all".
- **Sort dropdown** — Featured / Price ↑↓ / Newest / Best-selling / A–Z.
- **Richer product cards** — hover reveals a second image; **color swatches** (from variants) let you preview colorways; auto **badges** (New, Bestseller, Polarized, Rx-ready) from tags/metafields; a **"Try on"** shortcut reusing the existing `VirtualTryOn`.
- **Load more** (cursor paging) with a no-JS `?after=` fallback; **loading skeletons**.
- **SEO** — per-collection `<title>`/description from Shopify + `ItemList` structured data; clean filterable URLs.

Deferred to a fast-follow (kept out to keep this build focused): quick-view modal, wishlist/save (needs the accounts wiring), and recently-viewed. Noted in §14.

## 9. Frame Finder quiz integration

The quiz (`/quiz`) currently redirects to `/shop?shape=…&size=…&sun=…` (the fragile params). Rewrite the quiz's result mapping to target the real facets — e.g. redirect to `/shop/all?frame_shape=round&gender=mens` (or a chosen default collection) using the same query-param contract as the filter UI. One mapping table, unit-tested. No quiz UI change.

## 10. Error / empty / not-configured states

- **Shopify not configured / query throws** → graceful empty state (mirrors today's `try/catch` in `/shop`), no crash.
- **Unknown collection handle** → Next.js `notFound()` (404).
- **Valid collection, zero matches after filters** → "No frames match these filters" + a one-click "Clear filters" (drops the query string).
- **No filters configured in Search & Discovery yet** → sidebar simply renders nothing; grid still works. The page degrades to "all products in this collection."

## 11. Testing strategy

Pure-function unit tests (Vitest, no network) are the core:
- `catalog-filters.ts`: `searchParams → ProductFilter[]` (incl. multi-value, price range, unknown params ignored) and round-trip back to pills.
- sort mapping: every UI value → correct `{sortKey, reverse}`.
- quiz mapping: quiz answers → correct filter query string.
- `getCollectionProducts` response mapping: GraphQL shape → view model (mock fetch), including empty `filters`.
- **Card derivation**: badges (New/Bestseller/Polarized/Rx-ready) and color swatches derived correctly from tags/metafields/variants.
- Graceful-empty behavior when `SHOPIFY_*` unset.
No E2E required for this sub-project; a manual visual pass on one seeded collection is the acceptance check.

## 12. Roadmap — B and C (separate specs later)

- **B — Dynamic navigation:** `SiteHeader.tsx`'s hardcoded `NAV_LINKS` becomes data-driven. Option 1: read the list of Shopify Collections (or a chosen "featured" subset via a `menu` metafield/Shopify's `menu` API). Option 2: a small Supabase `nav_items` table + tiny admin editor. Decide at B's brainstorm.
- **C — Editable homepage/content:** `HeroShowcase`, the ticker, and featured rows become merchant-editable. Options: Shopify metaobjects, a Supabase `site_content` table + `/admin/content` editor, or a headless CMS (cost check vs <$100/mo). Decide at C's brainstorm.

## 13. Merchant setup runbook (post-build, no code)

1. **Collections:** Products → Collections → create categories; set each to automated (`tag = mens`, `type = Sunglasses`) or manual.
2. **Metafield definitions:** Settings → Custom data → Products → define `frame_shape`, `frame_material`, `lens_color`, `polarized`, `gender` (I can script the definitions once desired values are chosen).
3. **Search & Discovery app:** install (free, first-party) → Filters → add price, brand (vendor), and the metafields above → set display order.
4. **Tag/fill products:** set each product's metafields + tags.
→ Category pages + filters appear automatically.

## 14. Out of scope / YAGNI (this sub-project)
- Dynamic navigation menu (B) and editable homepage (C) — their own specs.
- **Fast-follow (A.2, not this build):** quick-view modal, wishlist/save (needs accounts wiring), recently-viewed.
- Free-text search box / autocomplete (separate feature).
- Per-customer personalization / recommendation engine.
- Any change to checkout, Rx, lab, inventory, auth, or Supabase — storefront-read-only.
- Infinite scroll (we use explicit "Load more").

## 15. Open decisions (carry into the plan)
- Final starter filter set + the allowed values per metafield (needs founder input on brands/shapes carried).
- Whether `/shop` root is a **category-tile landing** or a redirect to an "all" collection. (Recommend: tile landing showing all collections + an "All frames" tile.)
- Page size (default 24) and whether "Load more" is client-append or `?after=` links (recommend client-append with a no-JS `?after=` fallback).
