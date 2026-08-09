# Membership Funnel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/membership` as a high-converting editorial page powered by a live "membership math" engine, and feed it from four entry points (PDP, homepage, cart, /thanks).

**Architecture:** A pure, client-safe math core (`membership-math-core.ts`) computes savings from live Shopify prices; a server wrapper (`membership-math.ts`) fetches inputs and caches. Every funnel surface consumes the same engine and **fails closed** — when math is unavailable, modules render nothing. Spec: `docs/superpowers/specs/2026-08-08-membership-redesign-design.md`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Vitest (pure-logic tests only — no DOM testing library in this repo; components stay thin over tested pure functions).

## Global Constraints

- **No hardcoded prices.** All our prices come from Shopify at runtime. The single exception: the comparison table's "typical US vision insurance" figures, which are editorial content and must carry the footnote "Illustrative, based on typical published US vision-plan rates — not a quote."
- **Fail closed.** `null` math/pricing → module renders nothing or CTAs disabled with notice. Never render a wrong, stale, or fabricated number.
- **No fabricated social proof** — no testimonials, member counts, or fake urgency.
- **Copy stays US + Canada** (`ANNUAL MEMBERSHIP · PREPAID · US + CANADA`).
- **Design tokens:** use existing Tailwind tokens (`ink`, `accent`, `line`, `muted`, `muted-soft`, `base`, `base-deeper`, `success`, `error`) and the mono/serif/sans type mix. Existing images only (`public/images/campaign_*.jpg`, `hero_editorial_banner.jpg`).
- **Run `npm run lint` before every commit. Never `--no-verify`.**
- Keep files under ~300 lines; split when larger.
- All 547 existing tests must keep passing; account-page tests must pass **unmodified**.

---

### Task 1: Math core — pure functions

**Files:**
- Create: `src/lib/commerce/membership-math-core.ts`
- Test: `tests/lib/commerce/membership-math-core.test.ts`

**Interfaces:**
- Consumes: `MembershipPricing` type from `@/lib/commerce/membership-pricing` (existing: `MembershipTierPrice[] | null`, tiers ordered solo→duo→trio with `{ tier, pairs, price, perPair, currencyCode }`).
- Produces (used by Tasks 2–12):
  - `interface TierMath { tier: 'solo'|'duo'|'trio'; pairs: number; yearly: number; perPair: number; alaCarteYear: number; savings: number; savingsPct: number; currencyCode: string }`
  - `interface MembershipMath { representativeFramePrice: number; bestPerPair: number; tiers: TierMath[]; currencyCode: string }`
  - `medianPrice(prices: number[]): number | null`
  - `buildMembershipMath(pricing: MembershipPricing, framePrices: number[]): MembershipMath | null`
  - `pdpMathLine(math: MembershipMath | null, productPrice: number): { perPair: number; savingsVsThisFrame: number } | null`
  - `matchTierForCart(math: MembershipMath | null, frameCount: number, frameSubtotal: number): TierMath | null`
  - `cartFrameSummary(lines: Array<{ productHandle: string; unitPrice: number; quantity: number }>): { frameCount: number; frameSubtotal: number }`
  - `MATH_EXCLUDED_HANDLES` = `['membership', 'lens-upgrades']`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/commerce/membership-math-core.test.ts
import { describe, it, expect } from 'vitest';
import {
  medianPrice, buildMembershipMath, pdpMathLine, matchTierForCart, cartFrameSummary,
} from '@/lib/commerce/membership-math-core';
import type { MembershipPricing } from '@/lib/commerce/membership-pricing';

const PRICING: MembershipPricing = [
  { sku: 'SUB-1PAIR', tier: 'solo', pairs: 1, variantId: 'gid://1', price: 89, perPair: 89, currencyCode: 'USD' },
  { sku: 'SUB-2PAIR', tier: 'duo', pairs: 2, variantId: 'gid://2', price: 149, perPair: 75, currencyCode: 'USD' },
  { sku: 'SUB-3PAIR', tier: 'trio', pairs: 3, variantId: 'gid://3', price: 189, perPair: 63, currencyCode: 'USD' },
];

describe('medianPrice', () => {
  it('returns the middle value for an odd count', () => {
    expect(medianPrice([120, 250, 180])).toBe(180);
  });
  it('averages the two middle values for an even count', () => {
    expect(medianPrice([100, 200, 300, 400])).toBe(250);
  });
  it('ignores zero/negative/NaN prices', () => {
    expect(medianPrice([0, -5, NaN, 100, 200, 300])).toBe(200);
  });
  it('returns null with fewer than 3 valid prices (not representative)', () => {
    expect(medianPrice([100, 200])).toBeNull();
    expect(medianPrice([])).toBeNull();
  });
});

describe('buildMembershipMath', () => {
  it('computes per-tier à-la-carte cost, savings, and pct from the median', () => {
    const math = buildMembershipMath(PRICING, [150, 250, 350]); // median 250
    expect(math).not.toBeNull();
    expect(math!.representativeFramePrice).toBe(250);
    expect(math!.bestPerPair).toBe(63);
    const trio = math!.tiers.find((t) => t.tier === 'trio')!;
    expect(trio.alaCarteYear).toBe(750);       // 3 × 250
    expect(trio.savings).toBe(561);            // 750 − 189
    expect(trio.savingsPct).toBe(75);          // round(561/750 × 100)
    expect(trio.currencyCode).toBe('USD');
  });
  it('is null when membership pricing is null (fail closed)', () => {
    expect(buildMembershipMath(null, [150, 250, 350])).toBeNull();
  });
  it('is null when the catalog has fewer than 3 priced frames (fail closed)', () => {
    expect(buildMembershipMath(PRICING, [250, 300])).toBeNull();
  });
});

describe('pdpMathLine', () => {
  const math = buildMembershipMath(PRICING, [150, 250, 350])!;
  it('returns per-pair price and savings vs this frame', () => {
    expect(pdpMathLine(math, 250)).toEqual({ perPair: 63, savingsVsThisFrame: 187 });
  });
  it('is null when the frame is not cheaper as a member (never fake a saving)', () => {
    expect(pdpMathLine(math, 63)).toBeNull();
    expect(pdpMathLine(math, 40)).toBeNull();
  });
  it('is null when math is unavailable', () => {
    expect(pdpMathLine(null, 250)).toBeNull();
  });
});

describe('matchTierForCart', () => {
  const math = buildMembershipMath(PRICING, [150, 250, 350])!;
  it('matches the tier whose pairs equal the frame count when the subtotal beats the tier price', () => {
    expect(matchTierForCart(math, 3, 437)?.tier).toBe('trio');
    expect(matchTierForCart(math, 1, 250)?.tier).toBe('solo');
  });
  it('is null when the subtotal does not exceed the tier price', () => {
    expect(matchTierForCart(math, 3, 189)).toBeNull();
    expect(matchTierForCart(math, 1, 89)).toBeNull();
  });
  it('is null for 0 or 4+ frames', () => {
    expect(matchTierForCart(math, 0, 999)).toBeNull();
    expect(matchTierForCart(math, 4, 999)).toBeNull();
  });
  it('is null when math is unavailable', () => {
    expect(matchTierForCart(null, 3, 999)).toBeNull();
  });
});

describe('cartFrameSummary', () => {
  it('counts quantities and subtotal for frame lines only', () => {
    const lines = [
      { productHandle: 'dusk-wayfarer', unitPrice: 149, quantity: 2 },
      { productHandle: 'halcyon-aviator', unitPrice: 139, quantity: 1 },
      { productHandle: 'membership', unitPrice: 149, quantity: 1 },
      { productHandle: 'lens-upgrades', unitPrice: 40, quantity: 1 },
    ];
    expect(cartFrameSummary(lines)).toEqual({ frameCount: 3, frameSubtotal: 437 });
  });
  it('returns zeros for an empty cart', () => {
    expect(cartFrameSummary([])).toEqual({ frameCount: 0, frameSubtotal: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/commerce/membership-math-core.test.ts`
Expected: FAIL — cannot resolve `@/lib/commerce/membership-math-core`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/commerce/membership-math-core.ts
import type { MembershipPricing } from './membership-pricing';

/**
 * Pure membership savings math. Client-safe: NO server imports — the cart
 * nudge bundles this file. All figures derive from live Shopify prices
 * passed in by the server wrapper (membership-math.ts).
 */

export interface TierMath {
  tier: 'solo' | 'duo' | 'trio';
  pairs: number;
  yearly: number;
  perPair: number;
  alaCarteYear: number;
  savings: number;
  savingsPct: number;
  currencyCode: string;
}

export interface MembershipMath {
  representativeFramePrice: number;
  bestPerPair: number;
  tiers: TierMath[];
  currencyCode: string;
}

/** Products that are money-mechanics, not frames — excluded from all frame math. */
export const MATH_EXCLUDED_HANDLES = ['membership', 'lens-upgrades'] as const;

/** Median of valid (>0, finite) prices; null under 3 — not representative. */
export function medianPrice(prices: number[]): number | null {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length < 3) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildMembershipMath(
  pricing: MembershipPricing,
  framePrices: number[],
): MembershipMath | null {
  if (!pricing) return null;
  const median = medianPrice(framePrices);
  if (median === null) return null;
  const tiers: TierMath[] = pricing.map((t) => {
    const alaCarteYear = Math.round(t.pairs * median);
    const savings = Math.round(alaCarteYear - t.price);
    return {
      tier: t.tier,
      pairs: t.pairs,
      yearly: t.price,
      perPair: t.perPair,
      alaCarteYear,
      savings,
      savingsPct: alaCarteYear > 0 ? Math.round((savings / alaCarteYear) * 100) : 0,
      currencyCode: t.currencyCode,
    };
  });
  return {
    representativeFramePrice: Math.round(median),
    bestPerPair: Math.min(...tiers.map((t) => t.perPair)),
    tiers,
    currencyCode: tiers[0].currencyCode,
  };
}

/** "Or from $X/pair with membership" for a PDP price. Null when not a real saving. */
export function pdpMathLine(
  math: MembershipMath | null,
  productPrice: number,
): { perPair: number; savingsVsThisFrame: number } | null {
  if (!math || !Number.isFinite(productPrice)) return null;
  const savingsVsThisFrame = Math.round(productPrice - math.bestPerPair);
  if (savingsVsThisFrame <= 0) return null;
  return { perPair: math.bestPerPair, savingsVsThisFrame };
}

/** Tier whose pairs === frameCount (1–3), only when the cart already costs more. */
export function matchTierForCart(
  math: MembershipMath | null,
  frameCount: number,
  frameSubtotal: number,
): TierMath | null {
  if (!math || frameCount < 1 || frameCount > 3) return null;
  const tier = math.tiers.find((t) => t.pairs === frameCount);
  if (!tier || frameSubtotal <= tier.yearly) return null;
  return tier;
}

/** Frame-only count + subtotal from cart lines (membership/upgrade lines excluded). */
export function cartFrameSummary(
  lines: Array<{ productHandle: string; unitPrice: number; quantity: number }>,
): { frameCount: number; frameSubtotal: number } {
  const frames = lines.filter(
    (l) => !(MATH_EXCLUDED_HANDLES as readonly string[]).includes(l.productHandle),
  );
  return {
    frameCount: frames.reduce((n, l) => n + l.quantity, 0),
    frameSubtotal: frames.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/commerce/membership-math-core.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint && git add src/lib/commerce/membership-math-core.ts tests/lib/commerce/membership-math-core.test.ts
git commit -m "feat(membership): pure savings-math core (median, tier math, PDP + cart helpers)"
```

---

### Task 2: Math engine — server fetch + cache

**Files:**
- Create: `src/lib/commerce/membership-math.ts`
- Test: `tests/lib/commerce/membership-math.test.ts`

**Interfaces:**
- Consumes: `getMembershipPricing()` (existing), `storefrontFetch` (existing), Task 1 core.
- Produces: `getMembershipMath(): Promise<MembershipMath | null>` (React `cache()`d) — used by Tasks 3, 6, 7, 8, 10. Re-exports `pdpMathLine`, `matchTierForCart`, `cartFrameSummary`, and the types so server callers import one module.

- [ ] **Step 1: Write the failing tests** (mirror the mocking pattern in `tests/lib/commerce/membership-pricing.test.ts` — mock `storefrontFetch`, `vi.resetModules()` in `beforeEach`)

```ts
// tests/lib/commerce/membership-math.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const storefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, storefrontFetch: (...a: unknown[]) => storefrontFetch(...a) };
});

const MEMBERSHIP_VARIANTS = {
  productByHandle: {
    variants: {
      edges: [
        { node: { id: 'gid://1', sku: 'SUB-1PAIR', price: { amount: '89.00', currencyCode: 'USD' } } },
        { node: { id: 'gid://2', sku: 'SUB-2PAIR', price: { amount: '149.00', currencyCode: 'USD' } } },
        { node: { id: 'gid://3', sku: 'SUB-3PAIR', price: { amount: '189.00', currencyCode: 'USD' } } },
      ],
    },
  },
};

function framePrices(entries: Array<{ handle: string; amount: string }>) {
  return {
    products: {
      edges: entries.map(({ handle, amount }) => ({
        node: { handle, priceRange: { minVariantPrice: { amount, currencyCode: 'USD' } } },
      })),
    },
  };
}

const CATALOG = framePrices([
  { handle: 'dusk-wayfarer', amount: '150.00' },
  { handle: 'halcyon-aviator', amount: '250.00' },
  { handle: 'axiom-browline', amount: '350.00' },
  { handle: 'membership', amount: '89.00' },        // must be excluded
  { handle: 'lens-upgrades', amount: '25.00' },     // must be excluded
]);

beforeEach(() => {
  vi.resetModules();
  storefrontFetch.mockReset();
});

// getMembershipMath issues 2 storefront calls (membership variants + frame
// prices) in Promise.all order; route by query content, not call order.
function routeFetches() {
  storefrontFetch.mockImplementation((query: string) =>
    Promise.resolve(query.includes('FramePrices') ? CATALOG : MEMBERSHIP_VARIANTS),
  );
}

describe('getMembershipMath', () => {
  it('computes math from live tiers + median frame price, excluding non-frames', async () => {
    routeFetches();
    const { getMembershipMath } = await import('@/lib/commerce/membership-math');
    const math = await getMembershipMath();
    expect(math).not.toBeNull();
    expect(math!.representativeFramePrice).toBe(250); // membership/lens-upgrades excluded
    expect(math!.bestPerPair).toBe(63);
    expect(math!.tiers).toHaveLength(3);
  });

  it('is null when membership pricing is unavailable (fail closed)', async () => {
    storefrontFetch.mockImplementation((query: string) =>
      Promise.resolve(query.includes('FramePrices') ? CATALOG : { productByHandle: null }),
    );
    const { getMembershipMath } = await import('@/lib/commerce/membership-math');
    expect(await getMembershipMath()).toBeNull();
  });

  it('is null when the catalog fetch throws (fail closed, no mock fallback)', async () => {
    storefrontFetch.mockImplementation((query: string) =>
      query.includes('FramePrices')
        ? Promise.reject(new Error('network'))
        : Promise.resolve(MEMBERSHIP_VARIANTS),
    );
    const { getMembershipMath } = await import('@/lib/commerce/membership-math');
    expect(await getMembershipMath()).toBeNull();
  });

  it('is null with fewer than 3 priced frames', async () => {
    storefrontFetch.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('FramePrices')
          ? framePrices([
              { handle: 'dusk-wayfarer', amount: '150.00' },
              { handle: 'halcyon-aviator', amount: '250.00' },
            ])
          : MEMBERSHIP_VARIANTS,
      ),
    );
    const { getMembershipMath } = await import('@/lib/commerce/membership-math');
    expect(await getMembershipMath()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/commerce/membership-math.test.ts`
Expected: FAIL — cannot resolve `@/lib/commerce/membership-math`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/commerce/membership-math.ts
import { cache } from 'react';
import { storefrontFetch } from './shopify-storefront';
import { getMembershipPricing } from './membership-pricing';
import {
  buildMembershipMath,
  MATH_EXCLUDED_HANDLES,
  type MembershipMath,
} from './membership-math-core';

export type { MembershipMath, TierMath } from './membership-math-core';
export { pdpMathLine, matchTierForCart, cartFrameSummary } from './membership-math-core';

const FRAME_PRICES_QUERY = /* GraphQL */ `
  query FramePrices($first: Int = 100) {
    products(first: $first) {
      edges {
        node {
          handle
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

interface FramePricesResponse {
  products: {
    edges: Array<{
      node: { handle: string; priceRange: { minVariantPrice: { amount: string; currencyCode: string } } };
    }>;
  };
}

/**
 * All membership savings figures, from live Shopify prices only.
 * FAIL CLOSED: null (tier pricing unavailable, <3 priced frames, API error)
 * → every consumer renders nothing. Deliberately NO mock fallback — a
 * fabricated savings number is worse than no savings module.
 */
export const getMembershipMath = cache(async (): Promise<MembershipMath | null> => {
  try {
    const [pricing, frames] = await Promise.all([
      getMembershipPricing(),
      storefrontFetch<FramePricesResponse>(FRAME_PRICES_QUERY, { first: 100 }),
    ]);
    const framePrices = frames.products.edges
      .filter(({ node }) => !(MATH_EXCLUDED_HANDLES as readonly string[]).includes(node.handle))
      .map(({ node }) => Number(node.priceRange.minVariantPrice.amount));
    const math = buildMembershipMath(pricing, framePrices);
    if (!math) {
      console.error('[membership-math] inputs unavailable — savings modules fail closed');
    }
    return math;
  } catch (err) {
    console.error('[membership-math] Storefront fetch failed — savings modules fail closed', err);
    return null;
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/commerce/membership-math.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint && git add src/lib/commerce/membership-math.ts tests/lib/commerce/membership-math.test.ts
git commit -m "feat(membership): live membership-math engine (fail-closed, cached)"
```

---

### Task 3: `/api/membership-math` route

**Files:**
- Create: `src/app/api/membership-math/route.ts`

**Interfaces:**
- Consumes: `getMembershipMath()` from Task 2.
- Produces: `GET /api/membership-math` → `{ math: MembershipMath | null }`, `revalidate = 300`. Consumed by the cart nudge (Task 10). Mirrors `src/app/api/lens-pricing/route.ts` exactly (that route has no route-level test; the logic is fully covered by Task 2's tests — same posture here).

- [ ] **Step 1: Write the route**

```ts
// src/app/api/membership-math/route.ts
import { NextResponse } from 'next/server';
import { getMembershipMath } from '@/lib/commerce/membership-math';

// Public price data for the client-side cart nudge. `math: null` means
// savings figures are unavailable — the nudge must render nothing (fail
// closed), never estimate.
export const revalidate = 300;

export async function GET() {
  const math = await getMembershipMath();
  return NextResponse.json({ math });
}
```

- [ ] **Step 2: Verify it compiles and the suite still passes**

Run: `npx tsc --noEmit && npm test`
Expected: type-check clean; all tests pass.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint && git add src/app/api/membership-math/route.ts
git commit -m "feat(api): public membership-math endpoint for client consumers"
```

---

### Task 4: Upgrade rows + comparison builders (pure) — kills the hardcoded prices

**Files:**
- Create: `src/features/subscriptions/lib/upgrade-rows.ts`
- Create: `src/features/subscriptions/lib/comparison-rows.ts`
- Test: `tests/features/subscriptions/membership-page-logic.test.ts`

**Interfaces:**
- Consumes: `LensPricingMap` from `@/lib/commerce/lens-pricing` (existing: `Record<string, { optionId; variantId; price; currencyCode }> | null`), `MembershipPricing`, `MembershipMath`.
- Produces:
  - `interface UpgradeRow { label: string; price: number | null; currencyCode: string | null }`
  - `buildUpgradeRows(pricing: LensPricingMap | null): UpgradeRow[]` — rows for redemption-charged upgrades (progressive, photochromic, AR, 3 tints); `price: null` → UI shows "priced at redemption" with no number. Option ids match `skuToOptionId` output: `progressive`, `photochromic`, `ar`, `grey`, `amber`, `green`. (Blue-light and single-vision are membership-included — not rows. The unwired premium-frame surcharge is dropped per spec.)
  - `interface ComparisonColumns { alaCarteYear: number | null; membershipYear: number; currencyCode: string }`
  - `buildComparison(pricing: MembershipPricing, math: MembershipMath | null): ComparisonColumns | null` — Trio-basis (3 pairs/12 months). `null` when tier pricing is unavailable (whole table hides); `alaCarteYear: null` when only frame math is unavailable (column omitted, per spec).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/features/subscriptions/membership-page-logic.test.ts
import { describe, it, expect } from 'vitest';
import { buildUpgradeRows } from '@/features/subscriptions/lib/upgrade-rows';
import { buildComparison } from '@/features/subscriptions/lib/comparison-rows';
import { buildMembershipMath } from '@/lib/commerce/membership-math-core';
import type { LensPricingMap } from '@/lib/commerce/lens-pricing';
import type { MembershipPricing } from '@/lib/commerce/membership-pricing';

const PRICING: MembershipPricing = [
  { sku: 'SUB-1PAIR', tier: 'solo', pairs: 1, variantId: 'gid://1', price: 89, perPair: 89, currencyCode: 'USD' },
  { sku: 'SUB-2PAIR', tier: 'duo', pairs: 2, variantId: 'gid://2', price: 149, perPair: 75, currencyCode: 'USD' },
  { sku: 'SUB-3PAIR', tier: 'trio', pairs: 3, variantId: 'gid://3', price: 189, perPair: 63, currencyCode: 'USD' },
];

const LENS_PRICING: LensPricingMap = {
  progressive: { optionId: 'progressive', variantId: 'gid://p', price: 150, currencyCode: 'USD' },
  photochromic: { optionId: 'photochromic', variantId: 'gid://c', price: 85, currencyCode: 'USD' },
  ar: { optionId: 'ar', variantId: 'gid://a', price: 30, currencyCode: 'USD' },
  grey: { optionId: 'grey', variantId: 'gid://g', price: 40, currencyCode: 'USD' },
  amber: { optionId: 'amber', variantId: 'gid://m', price: 40, currencyCode: 'USD' },
  green: { optionId: 'green', variantId: 'gid://n', price: 40, currencyCode: 'USD' },
};

describe('buildUpgradeRows', () => {
  it('maps live prices onto the redemption-charged upgrade list', () => {
    const rows = buildUpgradeRows(LENS_PRICING);
    expect(rows.find((r) => r.label === 'Progressive Rx lenses')).toEqual({
      label: 'Progressive Rx lenses', price: 150, currencyCode: 'USD',
    });
    expect(rows).toHaveLength(6);
  });
  it('yields null prices when pricing is unavailable — UI shows no numbers', () => {
    const rows = buildUpgradeRows(null);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.price === null)).toBe(true);
  });
  it('yields a null price for an individually missing option', () => {
    const { progressive: _omit, ...partial } = LENS_PRICING;
    const rows = buildUpgradeRows(partial as LensPricingMap);
    expect(rows.find((r) => r.label === 'Progressive Rx lenses')!.price).toBeNull();
  });
});

describe('buildComparison', () => {
  const math = buildMembershipMath(PRICING, [150, 250, 350]); // median 250
  it('builds Trio-basis columns from live prices', () => {
    expect(buildComparison(PRICING, math)).toEqual({
      alaCarteYear: 750, membershipYear: 189, currencyCode: 'USD',
    });
  });
  it('omits the à-la-carte column when frame math is unavailable', () => {
    expect(buildComparison(PRICING, null)).toEqual({
      alaCarteYear: null, membershipYear: 189, currencyCode: 'USD',
    });
  });
  it('is null when tier pricing is unavailable (whole table hides)', () => {
    expect(buildComparison(null, math)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/features/subscriptions/membership-page-logic.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```ts
// src/features/subscriptions/lib/upgrade-rows.ts
import type { LensPricingMap } from '@/lib/commerce/lens-pricing';

export interface UpgradeRow {
  label: string;
  price: number | null;
  currencyCode: string | null;
}

// Upgrades charged at redemption (FAQ: "same prices as the shop"). Option ids
// are skuToOptionId() outputs for the LENSUP-* variants. Membership-included
// options (single_vision, blue_light) are NOT rows; the premium-frame
// surcharge is omitted until its variant is wired (spec 2026-08-08).
const REDEMPTION_UPGRADES: Array<{ optionId: string; label: string }> = [
  { optionId: 'progressive', label: 'Progressive Rx lenses' },
  { optionId: 'photochromic', label: 'Photochromic (Transitions)' },
  { optionId: 'ar', label: 'Anti-reflective coating' },
  { optionId: 'grey', label: 'Grey tint' },
  { optionId: 'amber', label: 'Amber tint' },
  { optionId: 'green', label: 'G-15 Green tint' },
];

/** Live prices onto the fixed label list; null price → "priced at redemption". */
export function buildUpgradeRows(pricing: LensPricingMap | null): UpgradeRow[] {
  return REDEMPTION_UPGRADES.map(({ optionId, label }) => ({
    label,
    price: pricing?.[optionId]?.price ?? null,
    currencyCode: pricing?.[optionId]?.currencyCode ?? null,
  }));
}
```

```ts
// src/features/subscriptions/lib/comparison-rows.ts
import type { MembershipPricing } from '@/lib/commerce/membership-pricing';
import type { MembershipMath } from '@/lib/commerce/membership-math-core';

export interface ComparisonColumns {
  alaCarteYear: number | null; // 3 × representative frame price; null → omit column
  membershipYear: number;      // live Trio yearly price
  currencyCode: string;
}

/**
 * 12-month comparison on a Trio basis (3 pairs). Null when tier pricing is
 * unavailable — the whole table hides rather than showing a partial money
 * comparison. Frame-math-only failure keeps the table but drops its
 * à-la-carte column (spec §5).
 */
export function buildComparison(
  pricing: MembershipPricing,
  math: MembershipMath | null,
): ComparisonColumns | null {
  if (!pricing) return null;
  const trio = pricing.find((t) => t.tier === 'trio');
  if (!trio) return null;
  const trioMath = math?.tiers.find((t) => t.tier === 'trio') ?? null;
  return {
    alaCarteYear: trioMath?.alaCarteYear ?? null,
    membershipYear: trio.price,
    currencyCode: trio.currencyCode,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/features/subscriptions/membership-page-logic.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint && git add src/features/subscriptions/lib/upgrade-rows.ts src/features/subscriptions/lib/comparison-rows.ts tests/features/subscriptions/membership-page-logic.test.ts
git commit -m "feat(membership): live upgrade rows + Trio comparison builders (no hardcoded prices)"
```

---

### Task 5: Page sections — hero, savings calculator, comparison, how-it-works, upgrades, sticky CTA

**Files:**
- Create: `src/features/subscriptions/components/MembershipHero.tsx`
- Create: `src/features/subscriptions/components/MembershipSavingsCalculator.tsx`
- Create: `src/features/subscriptions/components/MembershipComparisonTable.tsx`
- Create: `src/features/subscriptions/components/MembershipHowItWorks.tsx`
- Create: `src/features/subscriptions/components/MembershipUpgrades.tsx`
- Create: `src/features/subscriptions/components/MembershipStickyCTA.tsx`

**Interfaces:**
- Consumes: `MembershipMath`/`TierMath` (Task 1), `buildUpgradeRows`/`buildComparison` (Task 4), `LensPricingMap` (existing).
- Produces: six components assembled by Task 6. Props:
  - `MembershipHero` — no props (static; anchors to `#tiers`)
  - `MembershipSavingsCalculator({ math }: { math: MembershipMath })` — client; caller guards null
  - `MembershipComparisonTable({ columns }: { columns: ComparisonColumns })` — caller guards null
  - `MembershipHowItWorks` — no props
  - `MembershipUpgrades({ rows }: { rows: UpgradeRow[] })`
  - `MembershipStickyCTA({ show }: { show: boolean })` — client; renders after scrolling past hero, mobile only

All presentational (logic already tested in Tasks 1/4) — no unit tests; verified by type-check, build, and Task 12's visual pass.

- [ ] **Step 1: Write MembershipHero**

```tsx
// src/features/subscriptions/components/MembershipHero.tsx
import Image from 'next/image';
import Link from 'next/link';

/** Full-bleed dark editorial hero. No numbers here — numbers are live-only. */
export default function MembershipHero() {
  return (
    <section className="relative min-h-[70vh] flex items-end overflow-hidden bg-ink">
      <Image
        src="/images/campaign_black_titanium.jpg"
        alt=""
        fill
        priority
        className="object-cover opacity-60"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" aria-hidden="true" />
      <div className="relative max-w-5xl mx-auto w-full px-4 sm:px-6 pb-16 pt-40">
        <p className="font-mono text-xs font-bold uppercase tracking-[3px] text-white/70">
          Annual membership · Prepaid · US + Canada
        </p>
        <h1 className="font-sans text-5xl sm:text-7xl font-black tracking-tight uppercase text-white mt-3 max-w-3xl">
          Your year of eyewear. One price.
        </h1>
        <p className="font-serif italic text-base text-white/80 mt-4 max-w-xl leading-relaxed">
          One, two, or three pairs a year — any frame in the catalog, Rx or plano,
          crafted in our lab and shipped to your door.
        </p>
        <Link
          href="#tiers"
          className="inline-block mt-8 px-8 py-4 bg-white text-ink font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent hover:text-white transition-colors motion-reduce:transition-none"
        >
          Choose your tier ↓
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Write MembershipSavingsCalculator (client island)**

```tsx
// src/features/subscriptions/components/MembershipSavingsCalculator.tsx
'use client';

import { useState } from 'react';
import type { MembershipMath } from '@/lib/commerce/membership-math-core';

const TIER_LABELS: Record<string, string> = { solo: 'Solo', duo: 'Duo', trio: 'Trio' };

/**
 * Live per-pair vs à-la-carte math. Caller guards `math === null` (fail
 * closed) — this component always has real numbers.
 */
export default function MembershipSavingsCalculator({ math }: { math: MembershipMath }) {
  const [tierKey, setTierKey] = useState<'solo' | 'duo' | 'trio'>('duo');
  const tier = math.tiers.find((t) => t.tier === tierKey) ?? math.tiers[0];
  const showSavings = tier.savings > 0; // honest: never render a non-saving as a saving

  return (
    <section aria-label="Savings calculator" className="bg-white border border-line rounded-3xl p-8 shadow-sm">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-accent">
        Do the math
      </p>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mt-4">
        <div>
          <div role="group" aria-label="Pairs per year" className="inline-flex border border-line rounded-full overflow-hidden">
            {math.tiers.map((t) => (
              <button
                key={t.tier}
                onClick={() => setTierKey(t.tier)}
                aria-pressed={t.tier === tierKey}
                className={`px-5 py-2 font-mono text-sm font-bold transition-colors motion-reduce:transition-none ${
                  t.tier === tierKey ? 'bg-ink text-white' : 'bg-white text-muted hover:text-ink'
                }`}
              >
                {t.pairs}×
              </button>
            ))}
          </div>
          <p className="font-sans text-6xl font-black text-ink mt-6 leading-none">
            ${tier.perPair}
            <span className="text-xl align-top text-muted-soft font-mono">/PAIR</span>
          </p>
          <p className="font-mono text-xs text-muted mt-2">
            {TIER_LABELS[tier.tier]} — ${tier.yearly} {tier.currencyCode} once a year, {tier.pairs}{' '}
            {tier.pairs === 1 ? 'pair' : 'pairs'}
          </p>
        </div>
        <div className="md:text-right md:max-w-xs w-full">
          <p className="font-mono text-xs text-muted-soft line-through">
            ${tier.alaCarteYear} buying {tier.pairs} {tier.pairs === 1 ? 'pair' : 'pairs'} à la carte*
          </p>
          {showSavings && (
            <>
              <p className="font-sans text-2xl font-black text-accent mt-1">
                You keep ${tier.savings}
              </p>
              <div className="h-1.5 bg-base-deeper rounded-full mt-3 overflow-hidden" aria-hidden="true">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500 motion-reduce:transition-none"
                  style={{ width: `${Math.min(tier.savingsPct, 100)}%` }}
                />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-soft mt-2">
                {tier.savingsPct}% below à-la-carte
              </p>
            </>
          )}
        </div>
      </div>
      <p className="font-serif italic text-[11px] text-muted-soft mt-6">
        *À-la-carte figure = today&apos;s median catalog frame price (${math.representativeFramePrice}) × pairs.
        Live from our shop — not a made-up anchor.
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Write MembershipComparisonTable**

```tsx
// src/features/subscriptions/components/MembershipComparisonTable.tsx
import type { ComparisonColumns } from '@/features/subscriptions/lib/comparison-rows';

/**
 * 12-month cost comparison, Trio basis. Insurance figures are the ONLY
 * non-live numbers on the page — editorial, footnoted, no competitor names.
 * Caller guards `columns === null`.
 */
export default function MembershipComparisonTable({ columns }: { columns: ComparisonColumns }) {
  const cols = [
    columns.alaCarteYear !== null
      ? {
          title: 'Buying à la carte',
          cost: `$${columns.alaCarteYear}`,
          lines: ['3 pairs at full price', 'Any frame, any lenses', 'No commitment'],
          accent: false,
        }
      : null,
    {
      title: 'Typical vision insurance',
      cost: '≈ $216/yr premiums†',
      lines: ['Usually 1 pair/yr via allowance', 'Copays + network limits', 'Renews automatically'],
      accent: false,
    },
    {
      title: 'GlassyVision Trio',
      cost: `$${columns.membershipYear}`,
      lines: ['3 pairs included', 'Any frame, Rx or plano', 'No auto-renew, prorated refunds'],
      accent: true,
    },
  ].filter(Boolean) as Array<{ title: string; cost: string; lines: string[]; accent: boolean }>;

  return (
    <section aria-label="12-month cost comparison">
      <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2">
        12 months, three ways
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line mt-6">
        {cols.map((c) => (
          <div key={c.title} className={`bg-white p-6 ${c.accent ? 'ring-1 ring-accent relative z-10' : ''}`}>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-soft">{c.title}</p>
            <p className={`font-sans text-3xl font-black mt-3 ${c.accent ? 'text-accent' : 'text-ink'}`}>{c.cost}</p>
            <ul className="mt-4 space-y-1.5">
              {c.lines.map((line) => (
                <li key={line} className="font-mono text-[11px] text-muted flex gap-2">
                  <span aria-hidden="true" className={c.accent ? 'text-accent' : 'text-muted-soft'}>—</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="font-serif italic text-[11px] text-muted-soft mt-3">
        †Illustrative, based on typical published US vision-plan rates — not a quote. À-la-carte and
        membership figures are live from our shop.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Write MembershipHowItWorks and MembershipUpgrades**

```tsx
// src/features/subscriptions/components/MembershipHowItWorks.tsx
const STEPS: Array<[string, string, string]> = [
  ['01', 'Choose your tier', 'Solo, Duo, or Trio — one prepaid price for your year. Checkout takes a minute.'],
  ['02', 'Redeem anytime', 'Each pair is a slot in your account. Pick any frame whenever you want it — Rx pairs just need a prescription upload, same as any Rx order.'],
  ['03', 'We craft & ship', 'Every pair is cut and finished in our lab, quality-checked, and shipped to your door. US + Canada.'],
];

export default function MembershipHowItWorks() {
  return (
    <section aria-label="How membership works">
      <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2">
        How it works
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {STEPS.map(([n, title, body]) => (
          <div key={n} className="bg-white border border-line rounded-2xl p-6">
            <span className="font-mono text-xs font-bold text-accent">{n}</span>
            <h3 className="font-sans font-black text-sm uppercase text-ink mt-2">{title}</h3>
            <p className="font-serif italic text-xs text-muted leading-relaxed mt-2">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// src/features/subscriptions/components/MembershipUpgrades.tsx
import type { UpgradeRow } from '@/features/subscriptions/lib/upgrade-rows';

const INCLUDED = [
  'Any active-collection frame (acetate or titanium)',
  'Standard single-vision Rx lenses',
  'Non-Rx plano & blue-light protection',
  'Hardfold case & microfiber cloth',
];

/** Live upgrade prices; a null price renders "at redemption" — never a stale number. */
export default function MembershipUpgrades({ rows }: { rows: UpgradeRow[] }) {
  return (
    <section aria-label="Included versus optional upgrades" className="bg-white border border-line rounded-3xl p-8 shadow-sm">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-accent">
        Fair &amp; transparent
      </p>
      <h2 className="font-sans text-xl font-black uppercase text-ink tracking-tight mt-1">
        Included vs optional upgrades
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
        <div className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-accent">✓ Included in every pair</p>
          <ul className="space-y-2 font-serif italic text-xs text-ink/80 divide-y divide-line/60">
            {INCLUDED.map((item) => (
              <li key={item} className="pt-2 flex justify-between gap-4">
                <span>{item}</span>
                <strong className="font-mono not-italic text-ink shrink-0">COVERED</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-muted-soft">
            + Optional upgrades — priced at redemption, same as the shop
          </p>
          <ul className="space-y-2 font-mono text-xs text-ink divide-y divide-line/60">
            {rows.map((r) => (
              <li key={r.label} className="pt-2 flex justify-between gap-4">
                <span>{r.label}</span>
                <strong className="text-accent shrink-0">
                  {r.price !== null ? `+$${r.price} ${r.currencyCode}` : 'at redemption'}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write MembershipStickyCTA (client)**

```tsx
// src/features/subscriptions/components/MembershipStickyCTA.tsx
'use client';

import { useEffect, useState } from 'react';

/** Mobile-only bar after scrolling past the hero. Hidden for active members (show=false). */
export default function MembershipStickyCTA({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    const onScroll = () => setVisible(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [show]);

  if (!show || !visible) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-ink/95 backdrop-blur border-t border-white/10 p-3">
      <a
        href="#tiers"
        className="block w-full text-center px-4 py-3 bg-white text-ink font-sans font-bold text-xs uppercase tracking-widest"
      >
        Choose your tier →
      </a>
    </div>
  );
}
```

- [ ] **Step 6: Type-check, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add src/features/subscriptions/components/Membership{Hero,SavingsCalculator,ComparisonTable,HowItWorks,Upgrades,StickyCTA}.tsx
git commit -m "feat(membership): editorial page sections (hero, live savings calc, comparison, upgrades)"
```

---

### Task 6: `/membership` page rewrite

**Files:**
- Modify: `src/app/(site)/membership/page.tsx` (full rewrite of the JSX; keep the `hasActiveMembership` block and `revalidate` exactly as-is)

**Interfaces:**
- Consumes: all Task 5 components, `getMembershipMath` (Task 2), `buildUpgradeRows`/`buildComparison` (Task 4), existing `getMembershipPricing`, `getLensUpgradePricing`, `MembershipTierTable`.
- Produces: the assembled page. `MembershipTierTable` gets wrapped in `<div id="tiers">` (do not modify the component's fail-closed rendering).

- [ ] **Step 1: Rewrite the page**

```tsx
// src/app/(site)/membership/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { getMembershipPricing } from '@/lib/commerce/membership-pricing';
import { getMembershipMath } from '@/lib/commerce/membership-math';
import { getLensUpgradePricing } from '@/lib/commerce/lens-pricing';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import MembershipTierTable from '@/features/subscriptions/components/MembershipTierTable';
import MembershipHero from '@/features/subscriptions/components/MembershipHero';
import MembershipSavingsCalculator from '@/features/subscriptions/components/MembershipSavingsCalculator';
import MembershipComparisonTable from '@/features/subscriptions/components/MembershipComparisonTable';
import MembershipHowItWorks from '@/features/subscriptions/components/MembershipHowItWorks';
import MembershipUpgrades from '@/features/subscriptions/components/MembershipUpgrades';
import MembershipStickyCTA from '@/features/subscriptions/components/MembershipStickyCTA';
import { buildUpgradeRows } from '@/features/subscriptions/lib/upgrade-rows';
import { buildComparison } from '@/features/subscriptions/lib/comparison-rows';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Membership · GlassyVision',
  description: 'Your year of eyewear, one price. 1, 2, or 3 pairs — any frame, Rx or plano, crafted in our lab.',
};

const FAQ: Array<[string, string]> = [
  ['How does redeeming a pair work?', 'Each pair is a slot in your account. Redeem a slot whenever you want: pick any frame, configure lenses, and we make it. Prescription pairs need an Rx upload — same as any Rx order.'],
  ['What about lens upgrades?', 'Progressives, photochromic, and tints are priced at redemption, per pair, at the same prices as the shop. You only pay for upgrades on pairs that use them.'],
  ['What happens at the end of my year?', 'Unused pairs expire at term end. We remind you at 60, 30, and 7 days — with a 14-day grace period after that. No auto-renew, no surprise charges: renewing is a fresh purchase.'],
  ['Can I get a refund?', 'Unredeemed value is refundable on a prorated basis — contact us from your account and an admin handles it directly.'],
  ['Where do you ship?', 'US and Canada. Prescription eyewear is dispensed under US/Canadian rules; other regions are coming later.'],
];

export default async function MembershipPage() {
  const [pricing, math, lensPricing] = await Promise.all([
    getMembershipPricing(),
    getMembershipMath(),
    getLensUpgradePricing(),
  ]);
  const comparison = buildComparison(pricing, math);
  const upgradeRows = buildUpgradeRows(lensPricing);

  // Signed-in members with an active membership see a pointer, not buy CTAs.
  let hasActiveMembership = false;
  try {
    const customer = await getCurrentCustomer();
    if (customer) {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('subscription_memberships')
        .select('id')
        .eq('customer_id', customer.id)
        .in('status', ['active', 'grace'])
        .maybeSingle();
      hasActiveMembership = !!data;
    }
  } catch {
    hasActiveMembership = false; // signed-out or auth hiccup → show normal page
  }

  return (
    <div>
      <MembershipHero />
      <MembershipStickyCTA show={!hasActiveMembership} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {hasActiveMembership && (
          <div className="p-4 border border-accent bg-accent/5 rounded-xl">
            <p className="text-sm text-ink font-bold">You already have an active membership.</p>
            <Link href="/account/subscription" className="text-sm text-accent underline">
              Manage your pairs &amp; redeem slots →
            </Link>
          </div>
        )}

        {math && <MembershipSavingsCalculator math={math} />}

        <div id="tiers">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2 mb-6">
            Pick your year
          </h2>
          <MembershipTierTable pricing={pricing} canBuy={!hasActiveMembership} />
        </div>

        {comparison && <MembershipComparisonTable columns={comparison} />}

        <MembershipHowItWorks />

        <MembershipUpgrades rows={upgradeRows} />

        <section aria-label="Membership FAQ">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2">
            Questions, answered
          </h2>
          <div className="divide-y divide-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="py-3 group">
                <summary className="font-sans font-bold text-sm text-ink cursor-pointer list-none flex justify-between items-center">
                  {q}
                  <span aria-hidden="true" className="font-mono text-muted-soft group-open:rotate-45 transition-transform motion-reduce:transition-none">+</span>
                </summary>
                <p className="text-sm text-muted mt-2 max-w-2xl">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
```

Note: `MembershipTierTable` already renders its own fail-closed notice when `pricing` is null — pass it through unchanged. The page no longer contains ANY dollar literal.

- [ ] **Step 2: Verify no hardcoded prices remain**

Run: `grep -n '\$[0-9]' "src/app/(site)/membership/page.tsx"`
Expected: no output.

- [ ] **Step 3: Type-check, full test suite, build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all clean, all tests pass.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint && git add "src/app/(site)/membership/page.tsx"
git commit -m "feat(membership): rewrite /membership as editorial funnel page (live math, zero hardcoded prices)"
```

---

### Task 7: PDP entry point — MembershipMathLine

**Files:**
- Create: `src/features/subscriptions/components/MembershipMathLine.tsx`
- Modify: `src/app/(site)/p/[handle]/page.tsx` — insert directly under the price `<div className="flex items-center gap-3">…</div>` block (the one containing `${Number(product.price).toFixed(0)}`)

**Interfaces:**
- Consumes: `getMembershipMath`, `pdpMathLine` (Task 2), `MATH_EXCLUDED_HANDLES` (Task 1).
- Produces: `MembershipMathLine({ productHandle, productPrice }: { productHandle: string; productPrice: number })` — async server component; renders `null` for excluded handles or when math is null / not a saving.

- [ ] **Step 1: Write the component**

```tsx
// src/features/subscriptions/components/MembershipMathLine.tsx
import Link from 'next/link';
import { getMembershipMath, pdpMathLine } from '@/lib/commerce/membership-math';
import { MATH_EXCLUDED_HANDLES } from '@/lib/commerce/membership-math-core';

/**
 * "Or from $X/pair with membership" under the PDP price. Fail closed: math
 * unavailable, non-frame product, or no real saving → renders nothing.
 */
export default async function MembershipMathLine({
  productHandle,
  productPrice,
}: {
  productHandle: string;
  productPrice: number;
}) {
  if ((MATH_EXCLUDED_HANDLES as readonly string[]).includes(productHandle)) return null;
  const math = await getMembershipMath();
  const line = pdpMathLine(math, productPrice);
  if (!line) return null;
  return (
    <p className="mt-2 font-mono text-xs text-muted">
      Or from <strong className="text-accent">${line.perPair}/pair</strong> with membership{' '}
      <Link href="/membership" className="text-accent underline underline-offset-2">
        see how →
      </Link>
    </p>
  );
}
```

- [ ] **Step 2: Wire into the PDP**

In `src/app/(site)/p/[handle]/page.tsx`, add the import:

```tsx
import MembershipMathLine from '@/features/subscriptions/components/MembershipMathLine';
```

and insert immediately after the closing `</div>` of the price row (`<div className="flex items-center gap-3">…frame + standard lenses…</div>`):

```tsx
<MembershipMathLine productHandle={handle} productPrice={Number(product.price)} />
```

- [ ] **Step 3: Verify locally**

Run: `npx tsc --noEmit && npm test`
Then: `npm run dev` and load `http://localhost:3000/p/dusk-wayfarer` — the line renders under the price (dev uses mock catalog fallback for the PDP itself; the math line may correctly hide if Storefront creds are absent — that IS fail-closed behavior; confirm no error).
Expected: type-check + tests clean; page renders without error.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint && git add src/features/subscriptions/components/MembershipMathLine.tsx "src/app/(site)/p/[handle]/page.tsx"
git commit -m "feat(pdp): live membership per-pair math line under price"
```

---

### Task 8: Homepage entry point — MembershipBand

**Files:**
- Create: `src/features/subscriptions/components/MembershipBand.tsx`
- Modify: `src/app/(site)/page.tsx` — insert the band after the closing tag of the "Infinite Scrolling Ticker" `<div>` (the `bg-ink … animate-slide` block) and before the "Drop Status & Urgency Metrics Panel" section

**Interfaces:**
- Consumes: `getMembershipMath` (Task 2).
- Produces: `MembershipBand()` — async server component; renders `null` when math is null.

- [ ] **Step 1: Write the component**

```tsx
// src/features/subscriptions/components/MembershipBand.tsx
import Image from 'next/image';
import Link from 'next/link';
import { getMembershipMath } from '@/lib/commerce/membership-math';

/** Homepage editorial band for membership. Fail closed: no math → no band. */
export default async function MembershipBand() {
  const math = await getMembershipMath();
  if (!math) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-ink min-h-[420px] flex items-end">
        <Image
          src="/images/campaign_honey_tortoise.jpg"
          alt=""
          fill
          className="object-cover opacity-50"
          sizes="(min-width: 1280px) 1200px, 100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/50 to-transparent" aria-hidden="true" />
        <div className="relative p-8 sm:p-12 max-w-xl">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-amber-300">
            GlassyVision Membership
          </p>
          <h2 className="font-sans text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mt-2">
            Frames from ${math.bestPerPair}/pair
          </h2>
          <p className="font-serif italic text-sm text-white/80 mt-3 leading-relaxed">
            One prepaid year. Up to three pairs — any frame, Rx or plano — instead of
            ${math.representativeFramePrice} a pair à la carte.
          </p>
          <Link
            href="/membership"
            className="inline-block mt-6 px-6 py-3 bg-white text-ink font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent hover:text-white transition-colors motion-reduce:transition-none"
          >
            See the math →
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into the homepage**

In `src/app/(site)/page.tsx`, add the import:

```tsx
import MembershipBand from '@/features/subscriptions/components/MembershipBand';
```

and insert between the ticker `</div>` and the Drop Status section:

```tsx
{/* Membership Editorial Band */}
<MembershipBand />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: clean.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint && git add src/features/subscriptions/components/MembershipBand.tsx "src/app/(site)/page.tsx"
git commit -m "feat(home): membership editorial band with live per-pair hook"
```

---

### Task 9: Cart entry point — CartMembershipNudge

**Files:**
- Create: `src/features/cart/CartMembershipNudge.tsx`
- Modify: `src/features/cart/CartClient.tsx` — render the nudge above the checkout button area

**Interfaces:**
- Consumes: `matchTierForCart`, `cartFrameSummary`, `MembershipMath` types from `@/lib/commerce/membership-math-core` (client-safe — no server imports); `CartLine` from `@/features/cart/types`; `GET /api/membership-math` (Task 3).
- Produces: `CartMembershipNudge({ lines }: { lines: CartLine[] })` — client component. All decision logic is the already-tested `cartFrameSummary` + `matchTierForCart`; the component only fetches and renders.

- [ ] **Step 1: Write the component**

```tsx
// src/features/cart/CartMembershipNudge.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CartLine } from '@/features/cart/types';
import {
  cartFrameSummary,
  matchTierForCart,
  type MembershipMath,
} from '@/lib/commerce/membership-math-core';

const TIER_LABELS: Record<string, string> = { solo: 'Solo', duo: 'Duo', trio: 'Trio' };

/**
 * "Your cart is $437 — Trio covers 3 pairs for $189/yr." Renders only when
 * the live math actually beats the cart. Fetch failure / null math → nothing
 * (fail closed — never estimate a saving).
 */
export default function CartMembershipNudge({ lines }: { lines: CartLine[] }) {
  const [math, setMath] = useState<MembershipMath | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/membership-math')
      .then((r) => r.json())
      .then((body: { math: MembershipMath | null }) => { if (!cancelled) setMath(body.math); })
      .catch(() => { if (!cancelled) setMath(null); });
    return () => { cancelled = true; };
  }, []);

  const { frameCount, frameSubtotal } = cartFrameSummary(lines);
  const tier = matchTierForCart(math, frameCount, frameSubtotal);
  if (!tier) return null;

  return (
    <div className="p-4 border border-accent/40 bg-accent/5 rounded-xl">
      <p className="text-sm text-ink">
        <strong className="font-bold">Your {frameCount === 1 ? 'frame is' : `${frameCount} frames are`} ${frameSubtotal}.</strong>{' '}
        The {TIER_LABELS[tier.tier]} membership covers {tier.pairs}{' '}
        {tier.pairs === 1 ? 'pair' : 'pairs'} for ${tier.yearly}/yr.
      </p>
      <Link href="/membership" className="text-sm text-accent underline underline-offset-2">
        See if membership beats this cart →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire into CartClient**

In `src/features/cart/CartClient.tsx`, add the import:

```tsx
import CartMembershipNudge from '@/features/cart/CartMembershipNudge';
```

and render `<CartMembershipNudge lines={lines} />` in the summary column, above the checkout button block (inside the same container that shows subtotal/checkout — place it as the first child so the nudge reads before the total).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: clean. (Nudge visibility logic is covered by Task 1's `matchTierForCart`/`cartFrameSummary` tests.)

- [ ] **Step 4: Lint and commit**

```bash
npm run lint && git add src/features/cart/CartMembershipNudge.tsx src/features/cart/CartClient.tsx
git commit -m "feat(cart): membership nudge when live tier price beats the cart"
```

---

### Task 10: /thanks entry point — ThanksMembershipPitch

**Files:**
- Create: `src/features/subscriptions/components/ThanksMembershipPitch.tsx`
- Modify: `src/app/thanks/[orderId]/page.tsx` — render the pitch beneath the existing confirmation copy

**Interfaces:**
- Consumes: `getMembershipMath` (Task 2), `getCurrentCustomer` + `createAdminClient` (existing — same active-membership check as `/membership`).
- Produces: `ThanksMembershipPitch()` — async server component.

**Documented deviation from spec:** the spec says "non-membership orders only." `/thanks` deliberately performs **no order lookup** (2026-06-12 audit C3 — guessable orderId must not become an oracle) and the `orders/paid` webhook may not have landed yet, so order contents are unknowable here by design. Instead we suppress the pitch for signed-in visitors who already hold an active membership, and the copy is written to read fine even right after a membership purchase. Update the spec's §3 row for /thanks accordingly when this task lands.

- [ ] **Step 1: Write the component**

```tsx
// src/features/subscriptions/components/ThanksMembershipPitch.tsx
import Link from 'next/link';
import { getMembershipMath } from '@/lib/commerce/membership-math';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Post-purchase seed: "your next pair could be $X". No order lookup — /thanks
 * must stay order-blind (audit C3). Suppressed for active members; fail
 * closed when math is unavailable.
 */
export default async function ThanksMembershipPitch() {
  const math = await getMembershipMath();
  if (!math) return null;

  try {
    const customer = await getCurrentCustomer();
    if (customer) {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('subscription_memberships')
        .select('id')
        .eq('customer_id', customer.id)
        .in('status', ['active', 'grace'])
        .maybeSingle();
      if (data) return null; // already a member — no pitch
    }
  } catch {
    // signed-out / auth hiccup → show the pitch (it's generic and harmless)
  }

  return (
    <div className="mt-8 p-5 border border-line rounded-2xl bg-white text-left">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-accent">
        Before you go
      </p>
      <p className="font-sans font-black text-lg text-ink mt-1">
        Your next pair could be ${math.bestPerPair}.
      </p>
      <p className="font-serif italic text-sm text-muted mt-1 leading-relaxed">
        Members get up to three pairs a year — any frame, Rx or plano — for one prepaid price.
      </p>
      <Link href="/membership" className="inline-block mt-3 font-mono text-xs font-bold uppercase tracking-widest text-accent underline underline-offset-2">
        See the math →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire into the thanks page**

In `src/app/thanks/[orderId]/page.tsx`, add the import:

```tsx
import ThanksMembershipPitch from '@/features/subscriptions/components/ThanksMembershipPitch';
```

and render `<ThanksMembershipPitch />` inside the `max-w-lg` container, after the existing paragraph/links and before the container closes.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: clean.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint && git add src/features/subscriptions/components/ThanksMembershipPitch.tsx "src/app/thanks/[orderId]/page.tsx"
git commit -m "feat(thanks): membership pitch seed (order-blind, member-suppressed)"
```

---

### Task 11: Account slot-dashboard polish (visual only)

**Files:**
- Modify: `src/app/(site)/account/subscription/page.tsx` — class-level changes ONLY

**Interfaces:**
- Consumes/produces: nothing new. `deriveSlotState`, redemption queries, refund copy, and all logic stay byte-identical. Account tests (`tests/features/account/*`) must pass **unmodified** — that is the acceptance gate.

- [ ] **Step 1: Apply visual alignment**

Bounded change list (classes only; keep every data expression untouched):
1. Page header: wrap the existing title area with the funnel's eyebrow pattern — a `font-mono text-[10px] font-bold uppercase tracking-[3px] text-accent` eyebrow line reading `Your membership` above the existing `h1`.
2. Slot cards: unify card chrome to `bg-white border border-line rounded-2xl p-5 shadow-sm` (match Task 5 cards); keep the `STATE_CHIP` map's colors exactly as defined.
3. Section separators: replace ad-hoc margins with the funnel's `border-b border-line pb-2` header treatment for section headings.

- [ ] **Step 2: Verify logic untouched and tests pass**

Run: `git diff --stat "src/app/(site)/account/subscription/page.tsx"` — confirm only that file changed.
Run: `npm test`
Expected: all tests pass with **zero** test-file modifications.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint && git add "src/app/(site)/account/subscription/page.tsx"
git commit -m "style(account): align slot dashboard with membership funnel visual language"
```

---

### Task 12: Full verification + visual pass

**Files:** none created (screenshots go to the session scratchpad, not the repo).

- [ ] **Step 1: Full suite**

Run: `npm run lint && npm test && npm run build`
Expected: lint clean; **all** tests pass (547 existing + ~24 new); production build succeeds.

- [ ] **Step 2: Visual verification (Playwright)**

```bash
npm run dev &   # wait for ready on :3000
npx playwright screenshot --viewport-size=390,844 http://localhost:3000/membership /tmp-scratchpad/membership-mobile.png
npx playwright screenshot --viewport-size=1440,900 http://localhost:3000/membership /tmp-scratchpad/membership-desktop.png
npx playwright screenshot --viewport-size=1440,900 http://localhost:3000/ /tmp-scratchpad/home-desktop.png
```

(Use the session scratchpad path for output.) Read the screenshots and confirm: hero renders with photography and legible text; savings module and comparison table only show when Storefront creds are configured locally (absence = correct fail-closed rendering, page must still look complete without them); no horizontal overflow at 390px; sticky CTA appears on mobile after scroll.

- [ ] **Step 3: Fail-closed spot check**

With `SHOPIFY_STOREFRONT_ACCESS_TOKEN` unset (or pointed at a bad domain) in `.env.local`, load `/membership`:
Expected: hero, how-it-works, FAQ render; tier table shows the unavailable notice; NO savings module, NO comparison table, NO dollar figures anywhere on the page. Restore env afterwards.

- [ ] **Step 4: Update memory/docs and commit any stragglers**

Update the spec's /thanks row per Task 10's documented deviation. Then:

```bash
git add docs/superpowers/specs/2026-08-08-membership-redesign-design.md
git commit -m "docs(spec): record /thanks order-blind deviation (audit C3)"
```

Done criteria (sprint contract): all tests green with output shown; build succeeds; screenshots reviewed; zero hardcoded prices (`grep -rn '\$[0-9]' src/app/\(site\)/membership src/features/subscriptions/components` returns only test files / none); external code review dispatched after completion per CLAUDE.md.
