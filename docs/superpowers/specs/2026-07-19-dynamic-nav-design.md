# GlassyVision — Dynamic Navigation (Sub-project B) Design

- **Status:** Approved (decision made via founder Q&A 2026-07-19: Shopify Menus). Ready for implementation plan.
- **Date:** 2026-07-19
- **Relates to:** `2026-07-18-dynamic-catalog-design.md` §12 (B was scoped there); CLAUDE.md lock-in rule (all Shopify calls in `src/lib/commerce/`).

## 1. Decision

The site header's links come from **Shopify Navigation Menus** (Content → Menus, handle `main-menu`), read via the Storefront `menu(handle:)` API. The merchant curates items (collections, pages, custom links like `/quiz`) with Shopify's drag-and-drop editor; the header renders whatever the menu contains. Rejected: auto-listing collections (no curation, can't hold non-collection links), a Supabase `nav_items` + admin editor (rebuilds what Shopify ships free — YAGNI).

## 2. Architecture

- **New module `src/lib/commerce/menu.ts`** (deliberately NOT growing `shopify.ts`, per the catalog final-review follow-up):
  - `transformMenuUrl(url, storeDomain)` — pure, tested. Shopify menu item URLs are absolute against the store domain; map to app routes: `/collections/all`→`/shop/all`, `/collections/<h>`→`/shop/<h>`, `/collections`→`/shop`, `/products/<h>`→`/p/<h>`, `/pages/<h>`→`/<h>`, `/`→`/`; other same-store paths pass through as relative; different-host URLs stay absolute and are marked `external`; unparsable → null (item dropped).
  - `getMenu(handle='main-menu'): Promise<NavLink[]>` — Storefront fetch + map; on error or empty → `[]` (no mock fallback needed — nav is not money data; the caller's default covers it).
  - `getSiteNav(): Promise<NavLink[]>` — `getMenu()` result if non-empty, else `DEFAULT_NAV_LINKS` (today's Shop / Frame Finder / Drops / Story). **The site can never lose navigation.**
  - `NavLink = { href: string; label: string; external?: boolean }`.
- **`MENU_QUERY`** lives in `shopify-storefront.ts` with the other queries.
- **`(site)/layout.tsx`** becomes async, fetches `getSiteNav()`, passes `navLinks` prop to `SiteHeader`; gains `export const revalidate = 900` so the menu refreshes on the same 15-min cadence as the catalog (trade-off: fully-static site pages become ISR-900 — acceptable).
- **`SiteHeader`** loses the hardcoded `NAV_LINKS`; takes `navLinks: NavLink[]`; internal links render `<Link>`, external render `<a>`; desktop + mobile menus both prop-driven. Account/Cart stay fixed.

## 3. Merchant setup (non-blocking; fallback covers until done)

1. Grant the app's Storefront API the **`unauthenticated_read_content`** scope (2-click + update app) — without it the menu query errors and the default links render.
2. Curate **Content → Menus → Main menu** in Shopify admin.

## 4. Testing

TDD on `transformMenuUrl` (each mapping, external host, relative, invalid, query-string preservation) and `getMenu`/`getSiteNav` (mapping, error→default, empty→default) with mocked `storefrontFetch`. Header itself verified by tsc/lint + visual pass.

## 5. Out of scope (YAGNI)

Dropdown submenus (data model supports; render flat like today), footer menus, multi-menu support, link icons.
