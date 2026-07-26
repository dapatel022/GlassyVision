# GlassyVision — Unified Dynamic Banner System Design

- **Status:** Approved (founder directive 2026-07-26: "add all of this and make existing ones dynamic — easy to manage everything"). Ready for implementation plan.
- **Date:** 2026-07-26
- **Relates to:** `2026-07-19-editable-homepage-design.md` (same Metaobjects pattern), `2026-07-19-dynamic-nav-design.md` (URL-safety transform reused), CLAUDE.md lock-in + a11y rules.

## 1. Decision

One merchant-managed **`banner` metaobject type** powers every promotional slot on the site. The merchant creates a banner in Shopify, picks its **slot**, and it appears there; deactivate it and the slot renders nothing. Same read-path, fallback, and security posture as the menu/homepage systems. No new vendors, no new scopes beyond the already-planned `unauthenticated_read_metaobjects`.

## 2. Slots (six new placements)

| Slot key | Where it renders | Component |
|---|---|---|
| `announcement` | Site-wide thin strip above the header (inside the `(site)` layout; not on `/thanks`, which has no site shell by design) | `AnnouncementBar` |
| `plp_grid` | A promo tile inside the product grid on every collection page (after the 6th product; appended if fewer) — first page only, not load-more pages | `PromoTile` via `ProductGrid` |
| `quiz_results` | Above the grid on a PLP when the URL carries `quiz=true` | `PromoBanner` |
| `cart` | Top of the cart contents (above line items) | `PromoBanner` |
| `pdp` | Bottom of the product-page configurator column | `PromoBanner` |
| `thanks` | On the thank-you page between the copy and the account CTA — the natural membership-pitch spot | `PromoBanner` |

**Existing-surface upgrade included:** the PLP header renders the **collection's image** (already fetched, currently unused) as a wide banner strip above the title when present — completing "everything visual is Shopify-managed."

Out of scope (not banners): the Story/Lookbook/Made-in-India editorial pages stay code-managed; hero/ticker/badge already dynamic via sub-project C.

## 3. Content model (`banner` metaobject; keys exact)

- `slot` — single-line text; one of the six keys above (unknown values ignored).
- `title` — single-line text (required to render).
- `body` — multi-line text (optional).
- `cta_label` + `cta_url` — optional; URL passes through the **same transform + scheme allowlist as menu links** (`transformMenuUrl` — `/collections/x`→`/shop/x` mapping, javascript:/data: rejected, foreign hosts external).
- `image` — file reference (used by `plp_grid`; optional elsewhere, ignored where unsupported).
- `active` — boolean; only `"true"` renders.
- `order` — integer; first-by-order wins where a slot shows one banner (all slots show max 1 in v1; the API returns arrays for future multi-banner slots).

## 4. Architecture

- **`src/lib/commerce/content.ts` extended** with `SiteBanner { slot, title, body, cta: {href,label,external}|null, imageUrl: string|null }` and `getBanners(): Promise<Record<string, SiteBanner[]>>` — active-only, order-sorted, grouped by slot; error/empty → `{}` + `console.warn` (slots render nothing; the site never breaks). `BANNERS_QUERY` in `shopify-storefront.ts`.
- **Components** in `src/components/site/` (site-wide) and `src/features/shop/catalog/` (grid tile): `AnnouncementBar`, `PromoBanner` (generic inline card), `PromoTile` (+ `ProductGrid` gains optional `promo`/`promoIndex` props; splices the tile in).
- **Wiring:** `(site)/layout.tsx` fetches announcement; PLP fetches `plp_grid` + `quiz_results`; PDP fetches `pdp`; thanks fetches `thanks`; **cart route refactors** to a server `page.tsx` (fetches `cart` slot) + `CartClient.tsx` holding the existing client logic unchanged, receiving the banner as a prop.
- All slots follow the homepage invariant: **unset → renders nothing, gracefully.**

## 5. Merchant setup (non-blocking; slots invisible until done)

Define the `banner` metaobject type (fields §3, Storefront access ON) alongside the sub-project-C types; create entries per slot. Same `unauthenticated_read_metaobjects` scope already on the founder's click list.

## 6. Testing

TDD on `getBanners` (slot grouping, active filter, order sort, unknown-slot ignore, cta transform incl. scheme rejection, image ref, malformed/missing → `{}`). Components + wiring verified by tsc/lint + visual pass. Cart refactor gate: existing cart behavior byte-identical (client logic moved, not modified).

## 7. YAGNI

Scheduling windows, per-market banners, dismissible bars with cookies, A/B testing, multi-banner carousels per slot, rich text.
