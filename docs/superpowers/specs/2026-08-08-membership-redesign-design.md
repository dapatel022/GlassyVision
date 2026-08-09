# Membership Funnel Redesign — Design Spec

**Date:** 2026-08-08
**Status:** Approved in-session (founder chose: full-funnel scope, real checkout CTAs, hybrid visual direction, savings-math + comparison-table levers, all four entry points, Approach A).
**Builds on:** `2026-08-04-membership-tiers-purchase-flow-design.md` (tiers, purchase flow, slot dashboard — all built and live). This spec redesigns the **selling surface**; back-of-house (provisioning, redemption, refunds, end-of-term) is untouched.

## Goal

Turn `/membership` from an informational pricing page into a high-converting, premium funnel, and push qualified traffic into it from four entry points. Everything works end-to-end today against the existing Shopify checkout flow; nothing waits on payment KYC (CTAs go live the moment KYC clears — no rework).

## Approach (chosen: A — editorial scroll story + shared math engine)

One long-scroll `/membership` page: emotion up top (dark editorial hero with existing campaign photography), instrument-panel precision below (pricing, comparison, specs). A single server-side **membership math engine** computes every savings figure from live Shopify prices, and all funnel surfaces consume it. Fail closed everywhere: a wrong or stale number is never rendered.

Rejected: configurator-first page (heavier client JS, demotes photography, converts worse than clear static pricing for a 3-option choice); restyle-in-place (not a redesign, no savings engine).

## 1. The math engine — `src/lib/commerce/membership-math.ts`

Server lib, `cache()`d, same pattern as `lens-pricing.ts` / `membership-pricing.ts`.

**Inputs (all live, all fail-closed):**
- `getMembershipPricing()` — existing tier prices (SUB-1PAIR/2PAIR/3PAIR).
- **Representative frame price:** median `price` of catalog products fetched via Storefront API, excluding handles `membership` and `lens-upgrades`. Fewer than 3 priced frames → null (median of a near-empty catalog is not representative).

**Output:** `MembershipMath | null`

```ts
interface TierMath { tier: 'solo'|'duo'|'trio'; pairs: number; yearly: number;
  perPair: number; alaCarteYear: number;   // pairs × representativeFramePrice
  savings: number; savingsPct: number; currencyCode: string; }
interface MembershipMath { representativeFramePrice: number;
  bestPerPair: number;                      // lowest perPair across tiers (trio)
  tiers: TierMath[]; currencyCode: string; }
```

**Helpers (pure functions, unit-testable without network):**
- `pdpMathLine(math, productPrice)` → `{ perPair, savingsVsThisFrame } | null` — "or from $X/pair with membership" for a given PDP price. Null when `perPair >= productPrice` (never show a non-saving as a saving).
- `matchTierForCart(math, frameCount, frameSubtotal)` → `TierMath | null` — the tier whose `pairs === frameCount` (1–3 only), returned only when `frameSubtotal > tier.yearly`. 0 or 4+ frames, or subtotal ≤ tier price → null.

**API route:** `src/app/api/membership-math/route.ts` — `GET`, returns `{ math: MembershipMath | null }`, `revalidate = 300`. Public price data (same posture as `/api/lens-pricing`). Consumed only by client components (cart nudge).

## 2. `/membership` page — `src/app/(site)/membership/page.tsx` (rewrite)

Section order, top to bottom. New components live in `src/features/subscriptions/components/`.

| # | Section | Component | Notes |
|---|---|---|---|
| 1 | **Hero** | `MembershipHero` (server) | Full-bleed dark editorial; existing `public/images/campaign_black_titanium.jpg` or `hero_editorial_banner.jpg` (no new assets). H1: "Your year of eyewear. One price." Eyebrow: `ANNUAL MEMBERSHIP · PREPAID · US + CANADA`. CTA anchors to `#tiers`. |
| 2 | **Savings module** | `MembershipSavingsCalculator` (client island) | Segmented 1×/2×/3× control; shows per-pair vs à-la-carte (`alaCarteYear`), savings bar. Math passed as **server props** — no client fetch. `math === null` → renders nothing. Respects `prefers-reduced-motion`. |
| 3 | **Tier table** | existing `MembershipTierTable`, restyled | Fail-closed behavior and `MOST CHOSEN` Duo anchor unchanged; visual elevation only (id `#tiers`). |
| 4 | **Comparison table** | `MembershipComparisonTable` (server) | 12-month cost: *À la carte* (live: `alaCarteYear`) vs *Typical US vision insurance* (static illustrative figures, footnoted "illustrative; typical plan premiums + copays, not a quote") vs *Membership* (live). The insurance column is the **only** non-live number on the page and is labeled as such. No competitor names. |
| 5 | **How it works** | `MembershipHowItWorks` (server) | 3 steps: choose tier → redeem a slot anytime in 12 months → we craft & ship. Rx pairs note: upload at redemption, same as any Rx order. |
| 6 | **Upgrades transparency** | `MembershipUpgrades` (server) | **Replaces hardcoded $30/$45/$35/$40** with live `getLensUpgradePricing()`. Pricing null → list upgrade names with "priced at redemption", no numbers. Premium-frame surcharge line **dropped** (variant not wired; re-add when it exists). |
| 7 | **FAQ** | keep existing 5 items, restyled | Content unchanged. |
| 8 | **Sticky mobile CTA** | `MembershipStickyCTA` (client) | Mobile-only bar after scrolling past hero: "Choose your tier →" anchor to `#tiers`. Hidden when `hasActiveMembership`. |

Kept from current page: active-membership banner (members see "manage your pairs" pointer, CTAs suppressed), `revalidate = 300`, fail-closed pricing notice. Metadata updated to match new headline.

## 3. Entry points (all consume the engine; all render nothing when math is null)

| Surface | File touched | Component (new) | Behavior |
|---|---|---|---|
| PDP | `src/app/(site)/p/[handle]/page.tsx` | `MembershipMathLine` (server) | Under the price: "Or from $63/pair with membership →" via `pdpMathLine`. Hidden on `membership` / `lens-upgrades` PDPs and when helper returns null. |
| Homepage | `src/app/(site)/page.tsx` | `MembershipBand` (server) | Editorial band: campaign photography + savings hook ("Frames from $63/pair") + CTA to `/membership`. |
| Cart | `src/features/cart/CartClient.tsx` | `CartMembershipNudge` (client) | Fetches `/api/membership-math`. Counts frame lines (excludes membership + `LENSUP-*` lines); `matchTierForCart` hit → "Your cart is $437 — Trio covers 3 pairs for $189/yr →". Fetch fails / null → nothing. |
| /thanks | `src/app/thanks/[orderId]/page.tsx` | `ThanksMembershipPitch` (server) | Non-membership orders only: "Your next pair could be from $63/pair." Membership orders → nothing. |

## 4. Account dashboard polish — `src/app/(site)/account/subscription/page.tsx`

Visual-only: typography, status-chip styling, spacing aligned to the new language. **No logic changes** — slot states, redemption, refund copy untouched. Existing tests must pass unmodified.

## 5. Error handling

| Failure | Behavior |
|---|---|
| Membership pricing unavailable | Tier table notice + disabled CTAs (existing); hero still renders (no numbers in hero) |
| Representative frame price unavailable | `math` null → savings module, PDP line, homepage band, cart nudge, and /thanks pitch render nothing at all; comparison table omits its à-la-carte column |
| Lens-upgrade pricing unavailable | Upgrades section shows names with "priced at redemption", no numbers |
| `/api/membership-math` error | Route returns `{ math: null }`; cart nudge silent |

House rules honored: no hardcoded prices (insurance illustrative figures are labeled editorial content, not our prices); fail closed; no fabricated social proof; US/CA framing unchanged.

## 6. Testing (TDD for the engine)

- **Unit — math engine:** median computation (odd/even counts, exclusions), tier math from mocked pricing, fail-closed on null/partial inputs, `pdpMathLine` (saving, non-saving → null), `matchTierForCart` (0/1/2/3/4+ frames, subtotal below/above tier).
- **Component:** savings calculator fail-closed render; PDP line hidden on excluded handles and null math; cart nudge threshold behavior with mocked fetch; upgrades section with null pricing; sticky CTA hidden for active members.
- **Regression:** all existing tests (547) pass; account page tests unmodified.
- **Visual:** Playwright screenshot pass over `/membership` mobile + desktop before completion.

## Out of scope (YAGNI)

- Payment/KYC work (separate track; CTAs already point at working checkout flow).
- Testimonials, member counts, urgency timers (nothing fabricated).
- Founding-member program, gifting, tier changes mid-term.
- New photography or brand assets (existing campaign images only).
- Nav changes (Membership link already present).
