# GlassyVision — Editable Homepage Content (Sub-project C) Design

- **Status:** Approved in principle (recommended option proceeding; founder AFK — Shopify Metaobjects, consistent with sub-project B's pattern). Ready for implementation plan.
- **Date:** 2026-07-19
- **Relates to:** `2026-07-18-dynamic-catalog-design.md` §12 (C scoped there), `2026-07-19-dynamic-nav-design.md` (same read-from-Shopify + hard-fallback pattern), CLAUDE.md "don't hardcode prices".

## 1. Decision

Homepage editorial content comes from **Shopify Metaobjects** (Settings → Custom data → Metaobjects), read via the Storefront API. Rejected: a Supabase `site_content` + `/admin` editor (builds/maintains an editor Shopify ships free), a headless CMS (new vendor for one hero + one ticker — YAGNI).

## 2. Content model (merchant-defined in Shopify)

Two flat metaobject types (no nesting — keeps the queries simple and the ordering explicit):

**`hero_slide`** (one entry per showcase slide; fields):
- `product` — **product reference (required).** Title, handle, live price, and default image come from the referenced product — prices are never typed into content (no-hardcoded-prices rule).
- `tag` — single-line text (eyebrow, e.g. "Drop N° 01 · Best Seller").
- `description` — multi-line text (optional; falls back to the product description).
- `color_name` — single-line text (e.g. "Honey Tortoise Acetate").
- `color_hex` — single-line text (e.g. `#c9b77a`) for the style-selector swatch.
- `image` — file reference (optional override of the product image).
- `order` — integer (metaobjects have no manual API ordering; we sort by this).

**`homepage`** (singleton entry, handle `main`; fields):
- `ticker_phrases` — list of single-line text (the scrolling strip).
- `badge_text` — single-line text (the floating "Drop N° 01 · Hand-Finished" badge).

## 3. Architecture

- **New module `src/lib/commerce/content.ts`** (same isolation as `menu.ts`):
  - `getHomepageContent(): Promise<HomepageContent>` where `HomepageContent = { slides: HeroSlide[] | null; tickerPhrases: string[] | null; badgeText: string | null }`; `HeroSlide = { handle, title, price, colorName, colorHex, imageUrl, description, tag }` (matches the current `ShowcaseItem` shape minus `id`).
  - Two queries (`HERO_SLIDES_QUERY` = `metaobjects(type:"hero_slide")` with product/file references resolved; `HOMEPAGE_QUERY` = `metaobject(handle:{type:"homepage",handle:"main"})`), both in `shopify-storefront.ts`.
  - Slides missing a resolvable product are dropped; slides sorted by `order`. Any error or empty set → the corresponding field is `null` + `console.warn` — **the current hardcoded hero/ticker render as fallback, so the homepage can never go blank.**
- **`(site)/page.tsx`** fetches `getHomepageContent()` and passes props.
- **`HeroShowcase`** accepts optional `slides?: HeroSlide[]` (uses its built-in `SHOWCASE_ITEMS` when absent); the badge accepts `badgeText`. The ticker strip in `page.tsx` maps `tickerPhrases ??` the current four hardcoded phrases.

## 4. Merchant setup (non-blocking; fallback covers until done)

1. Grant the app's Storefront API the **`unauthenticated_read_metaobjects`** scope.
2. Define the two metaobject types (field keys exactly as §2) with **Storefront access enabled**, create the `homepage` entry (handle `main`) + hero_slide entries referencing real products.

## 5. Testing

TDD on `content.ts`: response mapping (product reference resolution, image override precedence, description fallback, `order` sorting, dropped slides without product), error/empty → nulls, singleton parsing (ticker list + badge). Components verified by tsc/lint + visual pass (fallback renders byte-identical homepage).

## 6. Out of scope (YAGNI)

Editable featured-row copy, drops section (Supabase-driven already), rich text/markdown, per-market content, scheduling/publishing windows, additional pages (story/FAQ).
