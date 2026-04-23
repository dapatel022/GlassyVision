# Week 3: Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js headless storefront — routes, cart, Shopify Storefront API integration, lens picker, thank-you + Rx funnel wiring, and stubs for branded/priced/legal surfaces — so the platform is **functionally end-to-end** and ready to swap real brand/SKU/photo content in.

**Architecture:** Next.js App Router consuming Shopify Storefront API via `src/lib/commerce/shopify.ts`. Cart is localStorage-persisted React context, flushed to Shopify at checkout. Pages use RSC `fetch()` with `{ next: { revalidate } }` for caching. Visual design follows Bold Editorial Cool system already defined in `globals.css`.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind CSS 4, Shopify Storefront API (GraphQL), Supabase (waitlist persistence).

**Scope reduction vs spec §4:** Because brand identity, SKUs, and photography are still open (see CLAUDE.md open decisions), the following are built as **functional stubs** that render correctly with placeholder content and will light up when real data arrives: home hero visuals, PDP photography, lookbook, brand editorial copy, legal page copy, drop landing copy.

**Out of scope (deferred to Week 3b / Week 5):**
- Shop filters beyond basic grid
- OG image generation
- Schema.org Product JSON-LD (Week 5 SEO pass)
- Lighthouse optimization (Week 7)

---

## Pre-flight

- [ ] **Step 0: Strip Lensabl references** from `src/components/Footer.tsx` and `src/components/Reviews.tsx` (CLAUDE.md mandate — trademark risk)

---

## Task 1: Extend Shopify Storefront API client

**Files:**
- Modify: `src/lib/commerce/shopify.ts`
- Modify: `src/lib/commerce/shopify-storefront.ts`
- Test: `tests/lib/commerce/shopify.test.ts` (extend existing)

**What's added:**
- `getProducts({ limit })` — list for shop grid
- `getProductByHandle(handle)` — PDP
- `createCart(lines)` — at checkout handoff
- `addToCart(cartId, lines)`, `updateCartLines`, `removeCartLines` — cart mutations
- `getCheckoutUrl(cartId)` — just returns `cart.checkoutUrl`

**Done criteria:**
- Functions exported from `shopify.ts`
- Tests mock `storefrontFetch` and assert payload shape
- Build passes

---

## Task 2: Site shell — Header + Footer + root layout

**Files:**
- Create: `src/components/site/SiteHeader.tsx`
- Create: `src/components/site/SiteFooter.tsx`
- Modify: `src/app/layout.tsx` (mount Header + Footer around children)
- Delete: `src/components/Navbar.tsx`, `src/components/Hero.tsx`, `src/components/ProductShowcase.tsx`, `src/components/FeatureSection.tsx`, `src/components/Reviews.tsx`, `src/components/Footer.tsx` (Lensabl scaffold — replace with on-brand components)

**Header contents:**
- Logo wordmark (`GLASSYVISION.` as text until real logo lands)
- Nav links: Shop, Drops, Story, Lookbook
- Cart indicator (count from CartContext) → `/cart`
- Mobile hamburger drawer

**Footer contents:**
- Newsletter email capture (wires to `/api/newsletter/subscribe` from Task 9)
- Link columns: Shop / About / Support / Legal
- Copyright + social handles

**Done criteria:** every page renders with Header + Footer. Nav links resolve (even if destination is a stub). Mobile responsive.

---

## Task 3: Cart state (context + localStorage)

**Files:**
- Create: `src/context/CartContext.tsx`
- Create: `src/features/cart/types.ts` — `CartLine`, `LensConfig`
- Create: `tests/features/cart/cart-context.test.tsx`

**Types:**
```ts
interface LensConfig {
  lensType: 'single_vision' | 'progressive' | 'non_rx';
  coatings: string[];
  tint: string | null;
}
interface CartLine {
  productId: string;
  variantId: string;
  productHandle: string;
  title: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  lensConfig: LensConfig;
}
```

**Context exposes:** `lines`, `addLine`, `updateQty`, `removeLine`, `clear`, `subtotal`, `hasRxItems`.

**Persistence:** localStorage under key `gv_cart_v1`. Hydrate on mount; write on every change.

**Done criteria:** tests cover add/update/remove/clear/subtotal. Context mounted in root layout.

---

## Task 4: Home page

**Files:**
- Rewrite: `src/app/page.tsx`

**Sections:**
1. Hero with current drop label, countdown placeholder, CTA → `/shop`
2. "8-frame grid" fetched via `getProducts({ limit: 8 })` (renders empty state with placeholders if Shopify not yet configured)
3. Waitlist capture form (email → `/api/waitlist/join`)
4. Brand teaser section linking to `/story`

**Rendering:** RSC, `export const revalidate = 900`.

**Done criteria:** page renders cleanly in both empty state (no Shopify) and populated state.

---

## Task 5: Shop grid

**Files:**
- Create: `src/app/shop/page.tsx`
- Create: `src/features/shop/ProductCard.tsx`

**Behavior:** calls `getProducts({ limit: 48 })`, renders responsive grid. Empty state: "Catalog launching soon — join waitlist."

**Done criteria:** route resolves, renders both states, ProductCard links to `/p/[handle]`.

---

## Task 6: Product detail page

**Files:**
- Create: `src/app/p/[handle]/page.tsx`
- Create: `src/features/shop/ProductGallery.tsx`
- Create: `src/features/shop/VariantPicker.tsx`
- Create: `src/features/shop/AddToCartButton.tsx` (client component; consumes CartContext)

**PDP sections:** image gallery, title + price, variant/color picker, lens picker (Task 7), add-to-cart button, description, shipping note.

**Done criteria:** fetches product via `getProductByHandle`; handles 404; add-to-cart pushes line to cart with selected lens config.

---

## Task 7: Lens picker

**Files:**
- Create: `src/features/shop/LensPicker.tsx`
- Create: `src/features/shop/lens-options.ts` — static config (options, price deltas)

**UI stages:** step 1 choose lens type, step 2 coatings multi-select, step 3 tint choice. Updates price total live. Emits `LensConfig` back to parent.

**Static config (placeholder until real pricing):**
```ts
export const LENS_TYPES = [
  { id: 'non_rx', label: 'Non-prescription', priceDelta: 0, rxRequired: false },
  { id: 'single_vision', label: 'Single-vision Rx', priceDelta: 50, rxRequired: true },
  { id: 'progressive', label: 'Progressive Rx', priceDelta: 150, rxRequired: true },
];
export const COATINGS = [
  { id: 'ar', label: 'Anti-reflective', priceDelta: 30 },
  { id: 'blue_light', label: 'Blue-light filter', priceDelta: 25 },
  { id: 'photochromic', label: 'Photochromic', priceDelta: 85 },
];
export const TINTS = [
  { id: 'none', label: 'Clear', priceDelta: 0 },
  { id: 'grey', label: 'Grey', priceDelta: 40 },
  { id: 'amber', label: 'Amber', priceDelta: 40 },
];
```

**Done criteria:** component unit-tested for price total calculation; emits correct `LensConfig`.

---

## Task 8: Cart page + checkout handoff

**Files:**
- Create: `src/app/cart/page.tsx`
- Create: `src/app/checkout/route.ts` (Next.js Route Handler, POST only)
- Create: `src/features/cart/CartLineItem.tsx`

**Cart page:** renders all lines with editable qty + remove. Shows Rx-required warning when `hasRxItems` is true. "Checkout" button POSTs to `/checkout`.

**/checkout handler:**
- Reads cart from request body
- Calls `createCart(lines)` via Shopify Storefront
- Stores `cart.id` in response cookie (for later sync if needed)
- Returns `{ checkoutUrl }` → client redirects

**Done criteria:** clicking Checkout takes user to `cart.checkoutUrl` (Shopify domain). Empty cart shows friendly empty state.

---

## Task 9: Waitlist + newsletter APIs

**Files:**
- Create: `src/app/api/waitlist/join/route.ts`
- Create: `src/app/api/newsletter/subscribe/route.ts`
- Create: `src/app/waitlist/[dropSlug]/page.tsx` (standalone waitlist page)

**Behavior:**
- `/api/waitlist/join` POST → insert into `waitlist` table (already in schema) with `drop_id` lookup by slug
- `/api/newsletter/subscribe` POST → insert into `waitlist` with `drop_id=null`, source=`newsletter`
- Both rate-limited cosmetically (one insert per email via unique constraint)

**Done criteria:** forms submit, row appears in Supabase, duplicate email returns friendly "you're already on the list" message.

---

## Task 10: Thank-you page (closes the funnel!)

**Files:**
- Create: `src/app/thanks/[orderId]/page.tsx`

**Behavior:**
- Server component reads `orderId` from route param
- Queries `orders` table for the order + checks `has_rx_items`
- If Rx required: prominent CTA → `/rx/[orderId]?token=<fresh-HMAC>` (use `createRxToken` from `src/features/rx-intake/lib/rx-token.ts`)
- If no Rx required: success message + link to `/track/[orderId]`
- Handles webhook race: if order not yet in DB, show pending state that reloads (mirrors RxOrderPending pattern)

**Done criteria:** wiring works — after a Shopify order, customer lands here, clicks CTA, arrives on Rx intake with valid token.

---

## Task 11: Public order tracking

**Files:**
- Create: `src/app/track/[orderId]/page.tsx`
- Create: `src/features/tracking/OrderTrackingView.tsx`

**Behavior:**
- Same HMAC token pattern as `/rx/[orderId]`
- Shows: order number, status timeline (ordered → Rx received → in production → shipped → delivered), shipment tracking number if set
- Data source: `orders` + `shipments` tables

**Done criteria:** valid token loads tracking; invalid token shows error.

---

## Task 12: Drop pages

**Files:**
- Create: `src/app/drops/page.tsx` — list all drops
- Create: `src/app/drops/[slug]/page.tsx` — single drop

**Behavior:** queries `drops` table. Empty state: "First drop launching soon."

**Done criteria:** both routes render with/without drops data.

---

## Task 13: Brand pages (stubs)

**Files:**
- Create: `src/app/story/page.tsx`
- Create: `src/app/made-in-india/page.tsx`
- Create: `src/app/lookbook/page.tsx`

**Contents:** on-brand layout with placeholder copy blocks clearly marked `{/* COPY: pending brand team */}`. Lookbook has placeholder image grid.

**Done criteria:** routes resolve, pages render within site shell, copy-pending markers visible for future swap.

---

## Task 14: Legal pages (templates)

**Files:**
- Create: `src/app/returns/page.tsx`
- Create: `src/app/privacy/page.tsx`
- Create: `src/app/terms/page.tsx`
- Create: `src/app/rx-disclaimer/page.tsx`
- Create: `src/app/faq/page.tsx`

**Contents:** each page is a structured template with section headers + placeholder text `{/* LEGAL: pending counsel review — see docs/research/compliance-playbook.md */}`.

**Done criteria:** routes resolve, pages are present and linked from Footer.

---

## Task 15: Account scaffolding (auth-gated)

**Files:**
- Create: `src/app/account/layout.tsx` (auth guard via `getCurrentUser`)
- Create: `src/app/account/page.tsx` (dashboard summary)
- Create: `src/app/account/orders/page.tsx` (order list)
- Create: `src/app/account/orders/[id]/page.tsx` (order detail)

**Behavior:** login redirect if not authenticated. Dashboard shows recent orders + "Start a return" CTA. Order detail shows line items + Rx status + tracking.

**Returns flow is deferred to Week 5.**

**Done criteria:** routes resolve, auth gate enforced, pages show customer's own orders only (RLS-scoped).

---

## Task 16: 404 + 500 + contact

**Files:**
- Create: `src/app/not-found.tsx`
- Create: `src/app/error.tsx` (client component, Sentry reports)
- Create: `src/app/contact/page.tsx`

**Done criteria:** 404/500 render on-brand, contact page shows `hello@glassyvision.com`.

---

## Task 17: Update sitemap + nav links

**Files:**
- Create: `src/app/sitemap.ts` (static for now — home, shop, drops, story, made-in-india, lookbook, legal pages)
- Modify: SiteHeader + SiteFooter to link every new route

**Done criteria:** `/sitemap.xml` resolves, Header/Footer exhaustive.

---

## Task 18: Final verification + tag

- [ ] **Step 1:** `npx vitest run` — all existing + new tests pass
- [ ] **Step 2:** `npm run lint` — 0 errors
- [ ] **Step 3:** `npm run build` — all new routes visible (`/`, `/shop`, `/p/[handle]`, `/cart`, `/checkout`, `/thanks/[orderId]`, `/track/[orderId]`, `/drops`, `/drops/[slug]`, `/story`, `/made-in-india`, `/lookbook`, `/returns`, `/privacy`, `/terms`, `/rx-disclaimer`, `/faq`, `/waitlist/[dropSlug]`, `/account`, `/account/orders`, `/account/orders/[id]`, `/contact`, `/api/waitlist/join`, `/api/newsletter/subscribe`)
- [ ] **Step 4:** `git tag -a v0.3.0-week3 -m "Week 3: Headless storefront (reduced scope — awaiting brand/SKU)"`

---

## Done Criteria Checklist

- [ ] Customer can browse shop → PDP → pick lens config → add to cart → click Checkout → land on Shopify checkout page
- [ ] After Shopify payment, customer returns to `/thanks/[orderId]` and clicks through to `/rx/[orderId]?token=...` (wires Week 2 into the funnel)
- [ ] Order tracking works at `/track/[orderId]?token=...`
- [ ] Waitlist / newsletter capture lands in Supabase
- [ ] All 20+ routes resolve (even stubs)
- [ ] Site shell (Header + Footer) on every page; mobile responsive
- [ ] No remaining Lensabl references
- [ ] Build passes, tests pass, lint clean

---

## What's NOT done (explicit)

- Real product photography → blocked on photo shoot
- Final home hero design → blocked on brand identity
- Final legal copy → blocked on counsel
- Final brand page copy → blocked on brand voice + founder
- Real pricing + margin split → blocked on supplier agreement
- PDP schema.org / OG images / Lighthouse pass → Week 5 / Week 7
- Shop filters (shape/color/price/Rx) → Week 3b or 7
- Returns flow UI → Week 5
