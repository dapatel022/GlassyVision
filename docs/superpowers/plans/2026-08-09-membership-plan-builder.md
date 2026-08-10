# Membership Plan Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let buyers configure 0..N pairs (frame + lenses + upgrades) inside the membership purchase, pay once through Shopify, and have configured pairs auto-enter the existing redemption pipeline after payment.

**Architecture:** Pair configurations ride the membership checkout as compact line-item attributes (`_pair_N`, ≤255 chars). `/checkout` re-derives and prices every chargeable upgrade server-side (fail closed). The order-sync webhook persists the configs; `provisionMembershipFromOrder` auto-redeems them by reusing `startRedemption`'s primitives (atomic slot claim → `reserve_inventory_unit` RPC → `createRedemptionFulfillmentOrder`). Failures fall back to open slots — a membership always provisions. Spec: `docs/superpowers/specs/2026-08-09-membership-plan-builder-design.md`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres), Shopify Storefront/Admin APIs, Vitest (pure-logic tests, no DOM library).

## Global Constraints

- **No hardcoded prices.** Upgrade prices come from `getLensUpgradePricing()`; the premium surcharge price from the new `getFrameSurchargePricing()` (Shopify variant `SURCH-PREMIUM`). UI shows live prices or disables the choice.
- **Fail closed.** Unresolvable pricing, malformed configs, pairs > plan → `/checkout` returns 409; nothing reaches Shopify. A wrong charge is never created.
- **Rx compliance unchanged.** Configured Rx pairs enter `awaiting_rx` on their synthesized redemption orders; the membership order itself stays `rx none`. Shipment gate, review queue, reminder cadence untouched.
- **Charge-carrier lines are never shippable.** `SUB-*` (exists), `LENSUP-*` (exists), and new `SURCH-*` lines must never enter the Rx pipeline, non-Rx queue, or work orders.
- **Attribute bound:** every `_pair_N` attribute value must be ≤ 255 characters (Shopify limit) — proven by test.
- **Membership always provisions.** Any per-pair auto-redeem failure (out of stock, bad destination, malformed config) reverts that pair to an open slot, writes an `audit_log` entry, and continues. Never throw the whole webhook away for one pair.
- Design tokens (`ink`, `accent`, `line`, `muted`, `muted-soft`, `base`, `base-deeper`) and mono/serif/sans type mix; honest labels only (no fabricated best-seller/review claims).
- Run `npm run lint` before every commit; never `--no-verify`; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- All 574 existing tests keep passing. Local `npm run build` (Turbopack) is broken on this machine — use `npx next build --webpack` for build verification.
- Migration numbering continues at `00046`.

**Manual merchant steps (tracked in Task 13, not code):** run `scripts/setup-frame-surcharges.js`, publish `frame-surcharges` to the headless channel, set `product_metadata.subscription_tier='premium'` + surcharge variant/price for premium frames, reprice tiers to $109/$179/$219, enable Bogus Gateway for E2E.

---

### Task 1: Pair-config codec (pure)

**Files:**
- Create: `src/features/subscriptions/lib/pair-config.ts`
- Test: `tests/features/subscriptions/pair-config.test.ts`

**Interfaces:**
- Consumes: nothing (pure module; `LensType` values mirror `src/features/cart/types.ts`).
- Produces (used by Tasks 4, 5, 6, 9–11):
  - `interface PairConfig { v: number; h: string; l: 'non_rx' | 'single_vision' | 'progressive'; u: string[]; t: 'none' | 'grey' | 'amber' | 'green' }` — v = frame variant id (numeric), h = product handle, l = lens type, u = paid non-tint upgrades ⊆ {progressive, photochromic, ar}, t = tint.
  - `PAIR_ATTR_MAX = 255`
  - `encodePairAttributes(configs: PairConfig[]): Array<{ key: string; value: string }>` — keys `_pair_1`.. in order.
  - `parsePairProperty(name: string, value: string): { index: number; config: PairConfig } | null` — accepts the webhook-normalized name form too (`pair1`); null on malformed JSON/shape.
  - `validatePairConfigs(input: unknown, maxPairs: number): { ok: true; configs: PairConfig[] } | { ok: false; error: string }`
  - `chargeableOptionIds(c: PairConfig): string[]` — `u` plus tint when `t !== 'none'`. Membership-covered choices (single_vision, blue_light, non-Rx) are never chargeable.
  - `pairRedemptionLensConfig(c: PairConfig): { lens_type: string; coatings: string[]; tint: string }` — vocabulary for `createRedemptionFulfillmentOrder`: `l==='non_rx'` maps to `'plano'` (**critical:** redemption-order treats any lens_type outside {non_prescription, plano, none} as wanting Rx); blue-light note: covered blue_light is NOT part of PairConfig (it's a coating in the shop model but membership-covered — the builder offers it as a covered choice and it rides in `coatings`). Coatings output = `u` filtered to {photochromic, ar} plus `'blue_light'` when `c.bl === true`… **no** — keep the shape minimal: add optional field `b?: boolean` (blue-light, covered, default false) to `PairConfig`; coatings output = `[...(c.b ? ['blue_light'] : []), ...c.u.filter((x) => x === 'photochromic' || x === 'ar')]`.

Final `PairConfig` shape (single source of truth, use exactly this everywhere):

```ts
export interface PairConfig {
  v: number;                                   // frame variant id
  h: string;                                   // product handle (lab/audit readability)
  l: 'non_rx' | 'single_vision' | 'progressive';
  u: string[];                                 // paid non-tint upgrades ⊆ ['progressive','photochromic','ar']
  t: 'none' | 'grey' | 'amber' | 'green';      // tint (paid when not 'none')
  b?: boolean;                                 // blue-light coating (covered, not charged)
}
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/features/subscriptions/pair-config.test.ts
import { describe, it, expect } from 'vitest';
import {
  encodePairAttributes, parsePairProperty, validatePairConfigs,
  chargeableOptionIds, pairRedemptionLensConfig, PAIR_ATTR_MAX,
  type PairConfig,
} from '@/features/subscriptions/lib/pair-config';

const RX_PAIR: PairConfig = { v: 43038182735943, h: 'dusk-wayfarer', l: 'progressive', u: ['progressive', 'photochromic'], t: 'grey' };
const PLANO_PAIR: PairConfig = { v: 43038182735944, h: 'marina-oval-sun', l: 'non_rx', u: [], t: 'none', b: true };

describe('encodePairAttributes', () => {
  it('emits _pair_N keys in order with parseable JSON values', () => {
    const attrs = encodePairAttributes([RX_PAIR, PLANO_PAIR]);
    expect(attrs.map((a) => a.key)).toEqual(['_pair_1', '_pair_2']);
    expect(JSON.parse(attrs[0].value)).toMatchObject({ v: RX_PAIR.v, l: 'progressive' });
  });
  it('stays under the 255-char Shopify attribute limit at worst case', () => {
    const worst: PairConfig = {
      v: 99999999999999, h: 'a'.repeat(60), l: 'single_vision',
      u: ['photochromic', 'ar'], t: 'amber', b: true,
    };
    const [attr] = encodePairAttributes([worst]);
    expect(attr.value.length).toBeLessThanOrEqual(PAIR_ATTR_MAX);
  });
});

describe('parsePairProperty', () => {
  it('round-trips an encoded attribute', () => {
    const [attr] = encodePairAttributes([RX_PAIR]);
    const parsed = parsePairProperty(attr.key, attr.value);
    expect(parsed).toEqual({ index: 1, config: RX_PAIR });
  });
  it('accepts the webhook-normalized name form (pair1)', () => {
    const [attr] = encodePairAttributes([PLANO_PAIR]);
    expect(parsePairProperty('pair1', attr.value)?.config.h).toBe('marina-oval-sun');
  });
  it('returns null for non-pair names and malformed JSON', () => {
    expect(parsePairProperty('lens_type', '{}')).toBeNull();
    expect(parsePairProperty('_pair_1', 'not-json')).toBeNull();
    expect(parsePairProperty('_pair_1', '{"v":"NaN"}')).toBeNull();
  });
});

describe('validatePairConfigs', () => {
  it('accepts a valid array within the plan size', () => {
    const r = validatePairConfigs([RX_PAIR, PLANO_PAIR], 3);
    expect(r.ok).toBe(true);
  });
  it('rejects more configs than the plan has pairs', () => {
    const r = validatePairConfigs([RX_PAIR, RX_PAIR, PLANO_PAIR, PLANO_PAIR], 3);
    expect(r.ok).toBe(false);
  });
  it('rejects progressive upgrade without progressive lens type (and vice versa)', () => {
    expect(validatePairConfigs([{ ...RX_PAIR, l: 'single_vision' }], 3).ok).toBe(false);
    expect(validatePairConfigs([{ ...RX_PAIR, u: ['photochromic'] }], 3).ok).toBe(false);
  });
  it('rejects unknown upgrade ids, bad tints, non-numeric variant ids', () => {
    expect(validatePairConfigs([{ ...PLANO_PAIR, u: ['blue_light'] }], 3).ok).toBe(false); // covered, never chargeable
    expect(validatePairConfigs([{ ...PLANO_PAIR, t: 'purple' as never }], 3).ok).toBe(false);
    expect(validatePairConfigs([{ ...PLANO_PAIR, v: -1 }], 3).ok).toBe(false);
  });
  it('rejects non-arrays', () => {
    expect(validatePairConfigs('nope', 3).ok).toBe(false);
    expect(validatePairConfigs(null, 3).ok).toBe(false);
  });
});

describe('chargeableOptionIds', () => {
  it('is u plus the tint when tinted', () => {
    expect(chargeableOptionIds(RX_PAIR)).toEqual(['progressive', 'photochromic', 'grey']);
  });
  it('is empty for a fully covered pair (blue-light is covered)', () => {
    expect(chargeableOptionIds(PLANO_PAIR)).toEqual([]);
  });
});

describe('pairRedemptionLensConfig', () => {
  it("maps non_rx to 'plano' so redemption-order treats it as non-Rx", () => {
    expect(pairRedemptionLensConfig(PLANO_PAIR)).toEqual({
      lens_type: 'plano', coatings: ['blue_light'], tint: 'none',
    });
  });
  it('keeps Rx types verbatim and folds coatings correctly', () => {
    expect(pairRedemptionLensConfig(RX_PAIR)).toEqual({
      lens_type: 'progressive', coatings: ['photochromic'], tint: 'grey',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/features/subscriptions/pair-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/subscriptions/lib/pair-config.ts

/**
 * Codec for purchase-time pair configurations riding Shopify checkout as
 * line-item attributes (_pair_1.._pair_N). Client-safe: no server imports.
 * Values MUST stay ≤255 chars (Shopify attribute limit) — proven by test.
 */

export interface PairConfig {
  v: number;
  h: string;
  l: 'non_rx' | 'single_vision' | 'progressive';
  u: string[];
  t: 'none' | 'grey' | 'amber' | 'green';
  b?: boolean;
}

export const PAIR_ATTR_MAX = 255;

const LENS_TYPES = new Set(['non_rx', 'single_vision', 'progressive']);
const PAID_UPGRADES = new Set(['progressive', 'photochromic', 'ar']);
const TINTS = new Set(['none', 'grey', 'amber', 'green']);
const MAX_HANDLE = 100;

export function encodePairAttributes(configs: PairConfig[]): Array<{ key: string; value: string }> {
  return configs.map((c, i) => ({
    key: `_pair_${i + 1}`,
    value: JSON.stringify(c.b ? { v: c.v, h: c.h, l: c.l, u: c.u, t: c.t, b: true } : { v: c.v, h: c.h, l: c.l, u: c.u, t: c.t }),
  }));
}

function coerceConfig(raw: unknown): PairConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const v = Number(o.v);
  const h = typeof o.h === 'string' ? o.h : '';
  const l = String(o.l ?? '');
  const u = Array.isArray(o.u) ? o.u.map(String) : null;
  const t = String(o.t ?? 'none');
  const b = o.b === true;
  if (!Number.isInteger(v) || v <= 0) return null;
  if (!h || h.length > MAX_HANDLE) return null;
  if (!LENS_TYPES.has(l)) return null;
  if (!u || u.some((x) => !PAID_UPGRADES.has(x)) || new Set(u).size !== u.length) return null;
  if (!TINTS.has(t)) return null;
  // progressive lens ⟺ progressive upgrade (it is how the charge is carried)
  const hasProg = u.includes('progressive');
  if ((l === 'progressive') !== hasProg) return null;
  const config: PairConfig = { v, h, l: l as PairConfig['l'], u, t: t as PairConfig['t'] };
  if (b) config.b = true;
  return config;
}

/** Accepts raw ('_pair_1') and webhook-normalized ('pair1') property names. */
export function parsePairProperty(name: string, value: string): { index: number; config: PairConfig } | null {
  const m = /^_?pair_?(\d+)$/.exec(name.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
  if (!m) return null;
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { return null; }
  const config = coerceConfig(raw);
  if (!config) return null;
  return { index: Number(m[1]), config };
}

export function validatePairConfigs(
  input: unknown,
  maxPairs: number,
): { ok: true; configs: PairConfig[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'pair configs must be an array' };
  if (input.length > maxPairs) return { ok: false, error: `plan covers ${maxPairs} pairs, got ${input.length}` };
  const configs: PairConfig[] = [];
  for (const raw of input) {
    const c = coerceConfig(raw);
    if (!c) return { ok: false, error: 'invalid pair configuration' };
    configs.push(c);
  }
  return { ok: true, configs };
}

/** Option ids charged as LENSUP-* lines for this pair. Covered choices never appear. */
export function chargeableOptionIds(c: PairConfig): string[] {
  return [...c.u, ...(c.t !== 'none' ? [c.t] : [])];
}

/**
 * Lens spec in createRedemptionFulfillmentOrder vocabulary. non_rx maps to
 * 'plano' — redemption-order treats any other value as wanting Rx.
 */
export function pairRedemptionLensConfig(c: PairConfig): { lens_type: string; coatings: string[]; tint: string } {
  return {
    lens_type: c.l === 'non_rx' ? 'plano' : c.l,
    coatings: [...(c.b ? ['blue_light'] : []), ...c.u.filter((x) => x === 'photochromic' || x === 'ar')],
    tint: c.t,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/features/subscriptions/pair-config.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint && git add src/features/subscriptions/lib/pair-config.ts tests/features/subscriptions/pair-config.test.ts
git commit -m "feat(membership): pair-config codec for purchase-time configuration"
```

---

### Task 2: Migration — `order_line_items.pair_configs`

**Files:**
- Create: `supabase/migrations/00046_pair_configs.sql`

**Interfaces:**
- Produces: nullable `jsonb` column `order_line_items.pair_configs` — an array of PairConfig objects persisted by Task 4's sync, read by Task 7's provisioning. Plus the matching type row in `src/lib/supabase/types.ts`.

- [ ] **Step 1: Write the migration**

```sql
-- 00046_pair_configs.sql
-- Purchase-time pair configurations for membership lines (_pair_N checkout
-- attributes, parsed by order sync). NULL for every non-membership line.
alter table order_line_items add column pair_configs jsonb;
comment on column order_line_items.pair_configs is
  'Array of PairConfig objects ({v,h,l,u,t,b?}) parsed from _pair_N line attributes on membership (SUB-*) lines; null otherwise.';
```

- [ ] **Step 2: Update generated types**

In `src/lib/supabase/types.ts`, find the `order_line_items` table block and add `pair_configs: Json | null` to its `Row`, `Insert` (optional), and `Update` (optional) shapes, matching the style of the neighboring jsonb columns.

- [ ] **Step 3: Apply locally if the local stack is running; verify types compile**

Run: `npx supabase db push --local 2>/dev/null || echo "local stack not running — apply before deploy (Task 13 checklist)"`, then `npx tsc --noEmit`.
Expected: type-check clean.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint && git add supabase/migrations/00046_pair_configs.sql src/lib/supabase/types.ts
git commit -m "feat(db): order_line_items.pair_configs for purchase-time membership configuration"
```

---

### Task 3: Frame-surcharge pricing lib + setup script

**Files:**
- Create: `src/lib/commerce/frame-surcharge-pricing.ts`
- Create: `scripts/setup-frame-surcharges.js`
- Test: `tests/lib/commerce/frame-surcharge-pricing.test.ts`

**Interfaces:**
- Consumes: `storefrontFetch` (existing pattern from `lens-pricing.ts`).
- Produces (Tasks 5, 8): `getFrameSurchargePricing(): Promise<FrameSurchargePrice | null>` with `interface FrameSurchargePrice { variantId: string; price: number; currencyCode: string }` (variantId is the gid). `FRAME_SURCHARGES_HANDLE = 'frame-surcharges'`, SKU `SURCH-PREMIUM`. Fail closed: product/SKU missing or fetch error → null.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/commerce/frame-surcharge-pricing.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const storefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, storefrontFetch: (...a: unknown[]) => storefrontFetch(...a) };
});

const PRODUCT = {
  productByHandle: {
    variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/777', sku: 'SURCH-PREMIUM', price: { amount: '40.00', currencyCode: 'USD' } } }] },
  },
};

beforeEach(() => { vi.resetModules(); storefrontFetch.mockReset(); });

describe('getFrameSurchargePricing', () => {
  it('returns the live premium surcharge', async () => {
    storefrontFetch.mockResolvedValueOnce(PRODUCT);
    const { getFrameSurchargePricing } = await import('@/lib/commerce/frame-surcharge-pricing');
    expect(await getFrameSurchargePricing()).toEqual({ variantId: 'gid://shopify/ProductVariant/777', price: 40, currencyCode: 'USD' });
  });
  it('is null when the product is missing (fail closed)', async () => {
    storefrontFetch.mockResolvedValueOnce({ productByHandle: null });
    const { getFrameSurchargePricing } = await import('@/lib/commerce/frame-surcharge-pricing');
    expect(await getFrameSurchargePricing()).toBeNull();
  });
  it('is null when the SURCH-PREMIUM SKU is absent', async () => {
    storefrontFetch.mockResolvedValueOnce({ productByHandle: { variants: { edges: [{ node: { id: 'gid://1', sku: 'OTHER', price: { amount: '40.00', currencyCode: 'USD' } } }] } } });
    const { getFrameSurchargePricing } = await import('@/lib/commerce/frame-surcharge-pricing');
    expect(await getFrameSurchargePricing()).toBeNull();
  });
  it('is null when the fetch throws (fail closed)', async () => {
    storefrontFetch.mockRejectedValueOnce(new Error('network'));
    const { getFrameSurchargePricing } = await import('@/lib/commerce/frame-surcharge-pricing');
    expect(await getFrameSurchargePricing()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/commerce/frame-surcharge-pricing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the lib**

```ts
// src/lib/commerce/frame-surcharge-pricing.ts
import { cache } from 'react';
import { storefrontFetch } from './shopify-storefront';

/**
 * Live premium-frame surcharge price, owned by the hidden Shopify product
 * `frame-surcharges` (SKU SURCH-PREMIUM, created by
 * scripts/setup-frame-surcharges.js). FAIL CLOSED: null means premium frames
 * are unselectable in the builder and /checkout 409s a premium pair.
 */

export const FRAME_SURCHARGES_HANDLE = 'frame-surcharges';
export const SURCH_PREMIUM_SKU = 'SURCH-PREMIUM';

export interface FrameSurchargePrice {
  variantId: string;
  price: number;
  currencyCode: string;
}

const QUERY = /* GraphQL */ `
  query FrameSurcharges($handle: String!) {
    productByHandle(handle: $handle) {
      variants(first: 5) {
        edges {
          node {
            id
            sku
            price {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

interface Response {
  productByHandle: {
    variants: { edges: Array<{ node: { id: string; sku: string | null; price: { amount: string; currencyCode: string } } }> };
  } | null;
}

export const getFrameSurchargePricing = cache(async (): Promise<FrameSurchargePrice | null> => {
  try {
    const data = await storefrontFetch<Response>(QUERY, { handle: FRAME_SURCHARGES_HANDLE });
    const node = data.productByHandle?.variants.edges.find((e) => e.node.sku === SURCH_PREMIUM_SKU)?.node;
    if (!node) {
      console.error('[frame-surcharge] SURCH-PREMIUM unavailable — premium frames fail closed. Run scripts/setup-frame-surcharges.js and publish to the headless channel.');
      return null;
    }
    return { variantId: node.id, price: Number(node.price.amount), currencyCode: node.price.currencyCode };
  } catch (err) {
    console.error('[frame-surcharge] Storefront fetch failed — premium frames fail closed', err);
    return null;
  }
});
```

- [ ] **Step 4: Write the setup script** — copy `scripts/setup-lens-addons.js` as the template and adapt: product title `Frame Surcharges`, handle `frame-surcharges`, one variant `{ sku: 'SURCH-PREMIUM', title: 'Premium frame surcharge', price: '40.00' }`, untracked inventory, `requires_shipping: false`, idempotent (never overwrites an existing variant's price), prints the variant id and TWO reminders: publish to the headless channel, and set `product_metadata.subscription_tier='premium'`, `subscription_surcharge_variant_id=<printed id>`, `subscription_surcharge_price=<price>` for each premium frame variant.

- [ ] **Step 5: Run tests, lint, commit**

Run: `npx vitest run tests/lib/commerce/frame-surcharge-pricing.test.ts` → PASS (4 tests).

```bash
npm run lint && git add src/lib/commerce/frame-surcharge-pricing.ts scripts/setup-frame-surcharges.js tests/lib/commerce/frame-surcharge-pricing.test.ts
git commit -m "feat(commerce): live premium frame surcharge pricing + idempotent setup script"
```

---

### Task 4: Order sync — persist pair configs, treat SURCH- as charge carrier

**Files:**
- Modify: `src/lib/commerce/sync.ts` (property scan ~lines 200–290)
- Modify: `src/features/admin/lib/non-rx-queue.ts:46` (queue exclusion)
- Test: extend the existing sync test file (locate with `grep -rln "syncShopifyOrder" tests/`)

**Interfaces:**
- Consumes: `parsePairProperty` (Task 1), `pair_configs` column (Task 2).
- Produces: membership (`SUB-*`) line rows carry `pair_configs: PairConfig[] | null`; `SURCH-*` lines behave exactly like `LENSUP-*` (isAddon: charge carrier only, never Rx/queue/work-order). Task 7 reads `pair_configs` from the membership line.

- [ ] **Step 1: Write the failing tests** (add to the existing sync test file; mirror its payload fixtures — the code below shows the new cases, adapt fixture helpers to that file's existing style)

```ts
it('persists _pair_N properties as pair_configs on the membership line', async () => {
  const payload = orderPayload({
    line_items: [{
      id: 111, product_id: 1, variant_id: 43038182735943, title: 'GlassyVision Membership — Trio',
      sku: 'SUB-3PAIR', price: '219.00', quantity: 1,
      properties: [
        { name: 'is_rx_required', value: 'false' },
        { name: '_pair_1', value: '{"v":43021235028039,"h":"dusk-wayfarer","l":"single_vision","u":[],"t":"none"}' },
        { name: '_pair_2', value: '{"v":43021235028040,"h":"marina-oval-sun","l":"non_rx","u":["photochromic"],"t":"grey"}' },
      ],
    }],
  });
  await syncShopifyOrder(payload, supabase);
  const membershipLine = insertedLineItems().find((li) => li.sku === 'SUB-3PAIR');
  expect(membershipLine.pair_configs).toHaveLength(2);
  expect(membershipLine.pair_configs[0]).toMatchObject({ v: 43021235028039, l: 'single_vision' });
});

it('drops malformed pair properties without failing the sync (fail-safe)', async () => {
  const payload = orderPayload({
    line_items: [{
      id: 112, product_id: 1, variant_id: 43038182735943, title: 'Membership', sku: 'SUB-2PAIR',
      price: '179.00', quantity: 1,
      properties: [{ name: '_pair_1', value: 'not-json' }],
    }],
  });
  const result = await syncShopifyOrder(payload, supabase);
  expect(result.success).toBe(true);
  expect(insertedLineItems().find((li) => li.sku === 'SUB-2PAIR').pair_configs).toBeNull();
});

it('treats SURCH- lines as addon charge carriers (never Rx, no pair_configs)', async () => {
  const payload = orderPayload({
    line_items: [{
      id: 113, product_id: 2, variant_id: 777, title: 'Premium frame surcharge', sku: 'SURCH-PREMIUM',
      price: '40.00', quantity: 1, properties: [],
    }],
  });
  await syncShopifyOrder(payload, supabase);
  const line = insertedLineItems().find((li) => li.sku === 'SURCH-PREMIUM');
  expect(line.addon_for_ref).not.toBeNull();
  expect(line.is_rx_required).toBe(false);
});

it('membership order with Rx pair configs stays rx none (pairs carry their own Rx)', async () => {
  const payload = orderPayload({
    line_items: [{
      id: 114, product_id: 1, variant_id: 43038182735943, title: 'Membership', sku: 'SUB-1PAIR',
      price: '109.00', quantity: 1,
      properties: [
        { name: 'is_rx_required', value: 'false' },
        { name: '_pair_1', value: '{"v":43021235028039,"h":"dusk-wayfarer","l":"progressive","u":["progressive"],"t":"none"}' },
      ],
    }],
  });
  await syncShopifyOrder(payload, supabase);
  expect(insertedOrder().rx_status).toBe('none');
});
```

- [ ] **Step 2: Run to verify the new cases fail**

Run: `npx vitest run <sync test file>`
Expected: new cases FAIL (pair_configs undefined / SURCH not addon).

- [ ] **Step 3: Implement in `sync.ts`**

In the property-scan loop add pair collection (before the loop declare `const pairProps: Array<{ index: number; config: import('@/features/subscriptions/lib/pair-config').PairConfig }> = [];` — import `parsePairProperty` at top):

```ts
// inside the for (const prop of properties) loop, alongside the other matchers:
const pairParsed = parsePairProperty(String(prop.name), String(prop.value));
if (pairParsed) pairProps.push(pairParsed);
```

Note: `_pair_N` normalizes to `pairN`, which matches none of the existing name matchers — no interference with `lens_type`/`is_rx_required` handling; the membership line's own attributes keep the order `rx none`.

Extend the addon detection:

```ts
const isAddon = addonForRef !== null
  || (item.sku ?? '').startsWith('LENSUP-')
  || (item.sku ?? '').startsWith('SURCH-');
```

And on the insert object add (membership lines only, sorted by index, malformed already dropped by the parser):

```ts
pair_configs: (item.sku ?? '').startsWith('SUB-') && pairProps.length > 0
  ? (pairProps.sort((a, b) => a.index - b.index).map((p) => p.config) as unknown as Json)
  : null,
```

(`pairProps` must be reset per line item — declare it inside the `for (const item of lineItems)` loop.)

In `src/features/admin/lib/non-rx-queue.ts` line 46, extend the exclusion:

```ts
.not('sku', 'like', 'SUB-%')
.not('sku', 'like', 'SURCH-%')
```

- [ ] **Step 4: Run the full sync + non-rx-queue test files**

Run: `npx vitest run <sync test file> tests/features/admin/non-rx-queue.test.ts`
Expected: PASS, including all pre-existing cases.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint && git add src/lib/commerce/sync.ts src/features/admin/lib/non-rx-queue.ts <sync test file>
git commit -m "feat(sync): persist purchase-time pair configs; SURCH- lines are charge carriers"
```

---

### Task 5: `/checkout` — validate pair configs, mint attributes + charge lines

**Files:**
- Modify: `src/features/cart/types.ts` (add `pairConfigs?: PairConfig[]` to `CartLine`)
- Modify: `src/app/checkout/route.ts`
- Test: create `tests/api/checkout-pair-configs.test.ts`

**Interfaces:**
- Consumes: Task 1 codec, `getLensUpgradePricing` (existing), `getFrameSurchargePricing` (Task 3), `getMembershipPricing` (existing — maps membership variant gid → `pairs`), `createAdminClient` (premium lookup in `product_metadata`).
- Produces: membership cart line minted with `_pair_N` attributes; one `LENSUP-*` line per chargeable option across pairs (each `{ key: '_addon_for', value: <membership lineRef> }`); one `SURCH-PREMIUM` line per premium pair. All fail-closed 409s listed below.

Validation matrix (all → 409 with a clear error):
1. `pairConfigs` present on a non-membership line (`productHandle !== 'membership'`).
2. `validatePairConfigs` fails (shape, count > tier pairs — tier resolved by matching the line's `variantId` against `getMembershipPricing()`; pricing null or variant unknown → 409).
3. A chargeable option id has no live price (`pricing?.[id]` missing) — existing fail-closed posture.
4. A premium pair (its `v` appears in `product_metadata` with `subscription_tier='premium'`) while `getFrameSurchargePricing()` is null.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/checkout-pair-configs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const createCart = vi.fn();
vi.mock('@/lib/commerce/shopify', () => ({ createCart: (...a: unknown[]) => createCart(...a) }));

const getLensUpgradePricing = vi.fn();
vi.mock('@/lib/commerce/lens-pricing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getLensUpgradePricing: () => getLensUpgradePricing() };
});

const getFrameSurchargePricing = vi.fn();
vi.mock('@/lib/commerce/frame-surcharge-pricing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getFrameSurchargePricing: () => getFrameSurchargePricing() };
});

const getMembershipPricing = vi.fn();
vi.mock('@/lib/commerce/membership-pricing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getMembershipPricing: () => getMembershipPricing() };
});

// Premium lookup: table-driven stub — .from('product_metadata') → premium rows for these variant ids
let premiumVariantIds: number[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: (_col: string, ids: number[]) => Promise.resolve({
          data: ids.filter((id) => premiumVariantIds.includes(id)).map((id) => ({ shopify_variant_id: id, subscription_tier: 'premium' })),
          error: null,
        }),
      }),
    }),
  }),
}));

const TIER_PRICING = [
  { sku: 'SUB-1PAIR', tier: 'solo', pairs: 1, variantId: 'gid://shopify/ProductVariant/1001', price: 109, perPair: 109, currencyCode: 'USD' },
  { sku: 'SUB-3PAIR', tier: 'trio', pairs: 3, variantId: 'gid://shopify/ProductVariant/1003', price: 219, perPair: 73, currencyCode: 'USD' },
];
const LENS_PRICING = {
  photochromic: { optionId: 'photochromic', variantId: 'gid://shopify/ProductVariant/85', price: 85, currencyCode: 'USD' },
  grey: { optionId: 'grey', variantId: 'gid://shopify/ProductVariant/40', price: 40, currencyCode: 'USD' },
};

function membershipLine(pairConfigs: unknown, variantId = 'gid://shopify/ProductVariant/1003') {
  return {
    productId: 'membership', variantId, productHandle: 'membership',
    title: 'GlassyVision Membership — Trio', image: null, unitPrice: 219, quantity: 1,
    lensConfig: { lensType: 'non_rx', coatings: [], tint: 'none' },
    pairConfigs,
  };
}

async function post(lines: unknown[]) {
  const { POST } = await import('@/app/checkout/route');
  return POST(new NextRequest('http://local/checkout', {
    method: 'POST', body: JSON.stringify({ lines }), headers: { 'Content-Type': 'application/json' },
  }));
}

beforeEach(() => {
  vi.resetModules();
  createCart.mockReset().mockResolvedValue({ id: 'cart1', checkoutUrl: 'https://x/checkout' });
  getLensUpgradePricing.mockReset().mockResolvedValue(LENS_PRICING);
  getFrameSurchargePricing.mockReset().mockResolvedValue({ variantId: 'gid://shopify/ProductVariant/777', price: 40, currencyCode: 'USD' });
  getMembershipPricing.mockReset().mockResolvedValue(TIER_PRICING);
  premiumVariantIds = [];
});

describe('/checkout with pair configs', () => {
  it('mints _pair_N attributes and LENSUP lines for chargeable options', async () => {
    const res = await post([membershipLine([
      { v: 501, h: 'dusk-wayfarer', l: 'single_vision', u: [], t: 'none' },
      { v: 502, h: 'marina-oval-sun', l: 'non_rx', u: ['photochromic'], t: 'grey' },
    ])]);
    expect(res.status).toBe(200);
    const cartLines = createCart.mock.calls[0][0];
    const mLine = cartLines[0];
    expect(mLine.attributes.find((a: { key: string }) => a.key === '_pair_1')).toBeTruthy();
    expect(mLine.attributes.find((a: { key: string }) => a.key === '_pair_2')).toBeTruthy();
    const addonIds = cartLines.slice(1).map((l: { merchandiseId: string }) => l.merchandiseId);
    expect(addonIds).toContain('gid://shopify/ProductVariant/85'); // photochromic
    expect(addonIds).toContain('gid://shopify/ProductVariant/40'); // grey tint
  });

  it('adds a SURCH-PREMIUM line for premium pairs', async () => {
    premiumVariantIds = [501];
    const res = await post([membershipLine([{ v: 501, h: 'axiom-browline', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(200);
    const addonIds = createCart.mock.calls[0][0].slice(1).map((l: { merchandiseId: string }) => l.merchandiseId);
    expect(addonIds).toContain('gid://shopify/ProductVariant/777');
  });

  it('409s when configs exceed the tier pair count', async () => {
    const res = await post([membershipLine(
      [{ v: 1, h: 'a', l: 'non_rx', u: [], t: 'none' }, { v: 2, h: 'b', l: 'non_rx', u: [], t: 'none' }],
      'gid://shopify/ProductVariant/1001', // Solo — 1 pair
    )]);
    expect(res.status).toBe(409);
  });

  it('409s a premium pair when surcharge pricing is unavailable (fail closed)', async () => {
    premiumVariantIds = [501];
    getFrameSurchargePricing.mockResolvedValue(null);
    const res = await post([membershipLine([{ v: 501, h: 'axiom-browline', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(409);
  });

  it('409s when membership pricing cannot resolve the tier', async () => {
    getMembershipPricing.mockResolvedValue(null);
    const res = await post([membershipLine([{ v: 501, h: 'x', l: 'non_rx', u: [], t: 'none' }])]);
    expect(res.status).toBe(409);
  });

  it('409s pairConfigs on a non-membership line', async () => {
    const res = await post([{ ...membershipLine([{ v: 1, h: 'a', l: 'non_rx', u: [], t: 'none' }]), productHandle: 'dusk-wayfarer' }]);
    expect(res.status).toBe(409);
  });

  it('zero-config membership purchase still works unchanged', async () => {
    const res = await post([membershipLine(undefined)]);
    expect(res.status).toBe(200);
    expect(createCart.mock.calls[0][0]).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/api/checkout-pair-configs.test.ts`
Expected: FAIL (pairConfigs ignored / no 409s).

- [ ] **Step 3: Implement**

`src/features/cart/types.ts`: add to `CartLine`:

```ts
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';
// on CartLine:
  /** Purchase-time membership pair configurations (membership lines only). */
  pairConfigs?: PairConfig[];
```

`src/app/checkout/route.ts`: inside the `for (const l of lines)` loop, after pushing the base line (keep everything existing), add the membership-pair branch. New imports: `validatePairConfigs, encodePairAttributes, chargeableOptionIds` from the codec, `getMembershipPricing`, `getFrameSurchargePricing`, `createAdminClient`.

```ts
    if (l.pairConfigs !== undefined) {
      if (l.productHandle !== 'membership') {
        return NextResponse.json({ error: 'Pair configurations are only valid on a membership line' }, { status: 409 });
      }
      const tiers = await getMembershipPricing();
      const tier = tiers?.find((t) => t.variantId === l.variantId);
      if (!tier) {
        console.error('[checkout] membership tier unresolvable — blocking configured purchase', { variantId: l.variantId });
        return NextResponse.json({ error: 'Membership pricing is unavailable — please try again shortly' }, { status: 409 });
      }
      const validated = validatePairConfigs(l.pairConfigs, tier.pairs);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 409 });
      }
      const configs = validated.configs;

      // Premium lookup: which chosen frames carry the surcharge.
      const supabase = createAdminClient();
      const { data: premiumRows } = await supabase
        .from('product_metadata')
        .select('shopify_variant_id, subscription_tier')
        .in('shopify_variant_id', configs.map((c) => c.v));
      const premiumSet = new Set(
        ((premiumRows ?? []) as Array<{ shopify_variant_id: number; subscription_tier: string | null }>)
          .filter((r) => r.subscription_tier === 'premium')
          .map((r) => r.shopify_variant_id),
      );
      const surcharge = premiumSet.size > 0 ? await getFrameSurchargePricing() : null;
      if (premiumSet.size > 0 && !surcharge) {
        console.error('[checkout] premium surcharge pricing unavailable — blocking configured purchase');
        return NextResponse.json({ error: 'Premium frame pricing is unavailable — please try again shortly' }, { status: 409 });
      }

      // Mint _pair_N attributes onto the membership line just pushed.
      const membershipCartLine = cartLines[cartLines.length - 1];
      membershipCartLine.attributes.push(...encodePairAttributes(configs));

      // Charge lines: LENSUP per chargeable option, SURCH per premium pair.
      const pairPricing = await getLensUpgradePricing();
      for (const config of configs) {
        for (const optionId of chargeableOptionIds(config)) {
          const upgrade = pairPricing?.[optionId];
          if (!upgrade) {
            console.error('[checkout] unresolvable pair upgrade — blocking checkout', { optionId });
            return NextResponse.json({ error: 'Lens upgrade pricing is unavailable — please try again shortly' }, { status: 409 });
          }
          cartLines.push({
            merchandiseId: upgrade.variantId,
            quantity: 1,
            attributes: [{ key: '_addon_for', value: lineRef }, { key: 'is_rx_required', value: 'false' }],
          });
        }
        if (premiumSet.has(config.v)) {
          cartLines.push({
            merchandiseId: surcharge!.variantId,
            quantity: 1,
            attributes: [{ key: '_addon_for', value: lineRef }, { key: 'is_rx_required', value: 'false' }],
          });
        }
      }
    }
```

Note: `lineRef` is the existing per-line `randomUUID()` already in scope in the loop.

- [ ] **Step 4: Run new + full checkout-adjacent tests**

Run: `npx vitest run tests/api/checkout-pair-configs.test.ts && npm test`
Expected: new file PASS (7 tests); full suite green.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint && git add src/features/cart/types.ts src/app/checkout/route.ts tests/api/checkout-pair-configs.test.ts
git commit -m "feat(checkout): validate + price purchase-time pair configs (fail closed)"
```

---

### Task 6: Auto-redeem lib

**Files:**
- Create: `src/features/subscriptions/auto-redeem-pairs.ts`
- Create: `src/lib/email/templates/pair-fallback.ts`
- Test: `tests/features/subscriptions/auto-redeem-pairs.test.ts`

**Interfaces:**
- Consumes: Task 1 codec (`pairRedemptionLensConfig`), `createRedemptionFulfillmentOrder` (existing), `reserve_inventory_unit` RPC (existing), `isDispensableDestination` (existing), `sendEmail` (existing, best-effort).
- Produces (Task 7):

```ts
export interface AutoRedeemContext {
  membershipId: string;
  orderId: string;                 // internal orders.id of the membership purchase
  customerId: string | null;
  customerEmail: string | null;
  currency: string | null;
  shipTo: Record<string, unknown> | null;   // Shopify shipping_address from the order
}
export async function autoRedeemConfiguredPairs(
  configs: PairConfig[],
  ctx: AutoRedeemContext,
  supabase: SupabaseClient,
): Promise<{ redeemed: number; fallbacks: number }>
```

Behavior per pair (order matters):
1. If `shipTo` is null or `!isDispensableDestination(shipTo, null)` → ALL pairs fall back (one audit entry per pair, reason `destination_not_dispensable`), return early.
2. Claim the lowest-index `available` slot for the membership (conditional update `status='available'` → `'locked'`, setting `frame_variant_id`, `lens_config` (from `pairRedemptionLensConfig`), `ship_to`, `expected_surcharge: 0`, `is_premium` from a `product_metadata` read).
3. Reserve inventory via `reserve_inventory_unit` (`p_reason: 'subscription_reserved'`). Failure → revert the slot exactly like `startRedemption`'s revert (status available, null frame, `{}` lens_config, null ship_to) → fallback record.
4. `createRedemptionFulfillmentOrder({...})` → update slot to `awaiting_rx` / `awaiting_fulfillment` (per `hasRxItems`), set `internal_order_id`, `internal_line_item_id`, `redeemed_at`.
5. Any throw inside a pair → catch, audit (`auto_redeem_pair_failed`, reason from the error), attempt slot revert, continue with the next pair.

Fallbacks: one `audit_log` insert per failed pair — `action: 'auto_redeem_pair_failed'`, `entity_type: 'subscription_memberships'`, `entity_id: ctx.membershipId`, `after_data: { order_id, pair_index, frame_variant_id, handle, reason }` — plus ONE best-effort `pair_fallback` email (template below) when `fallbacks > 0 && ctx.customerEmail`, never gating.

- [ ] **Step 1: Write the failing tests** — self-contained table-driven Supabase stub (no DOM, no network):

```ts
// tests/features/subscriptions/auto-redeem-pairs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';

const createRedemptionFulfillmentOrder = vi.fn();
vi.mock('@/features/subscriptions/redemption-order', () => ({
  createRedemptionFulfillmentOrder: (...a: unknown[]) => createRedemptionFulfillmentOrder(...a),
}));
vi.mock('@/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }) }));

// --- minimal chainable Supabase stub -------------------------------------
interface StubState {
  slots: Array<{ id: string; slot_index: number; status: string }>;
  premiumVariantIds: number[];
  reserveFailsFor: number[];       // frame variant ids whose reservation fails
  audits: Array<Record<string, unknown>>;
  slotUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
}
let state: StubState;

function stubSupabase() {
  return {
    from(table: string) {
      if (table === 'subscription_redemptions') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: state.slots.filter((s) => s.status === 'available').slice(0, 1), error: null }) }) }) }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_c: string, id: string) => ({
              eq: () => ({
                select: () => {
                  const slot = state.slots.find((s) => s.id === id && s.status === 'available');
                  if (slot && patch.status === 'locked') { slot.status = 'locked'; state.slotUpdates.push({ id, patch }); return Promise.resolve({ data: [{ id }], error: null }); }
                  return Promise.resolve({ data: [], error: null });
                },
              }),
              then: (resolve: (v: { data: null; error: null }) => void) => {
                // plain .update().eq(id) — status transitions and reverts
                const slot = state.slots.find((s) => s.id === id);
                if (slot && typeof patch.status === 'string') slot.status = patch.status;
                state.slotUpdates.push({ id, patch });
                resolve({ data: null, error: null });
              },
            }),
          }),
        };
      }
      if (table === 'product_metadata') {
        return { select: () => ({ eq: (_c: string, v: number) => ({ maybeSingle: () => Promise.resolve({ data: state.premiumVariantIds.includes(v) ? { subscription_tier: 'premium' } : null, error: null }) }) }) };
      }
      if (table === 'audit_log') {
        return { insert: (row: Record<string, unknown>) => { state.audits.push(row); return Promise.resolve({ data: null, error: null }); } };
      }
      if (table === 'communications') {
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'comm1' }, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (_fn: string, args: { p_variant_id: number }) =>
      Promise.resolve(state.reserveFailsFor.includes(args.p_variant_id)
        ? { data: null, error: null }
        : { data: 'pool-1', error: null }),
  };
}
// -------------------------------------------------------------------------

const CTX = {
  membershipId: 'm1', orderId: 'o1', customerId: 'c1',
  customerEmail: 'buyer@example.com', currency: 'usd',
  shipTo: { country_code: 'US' },
};
const RX_PAIR: PairConfig = { v: 501, h: 'dusk-wayfarer', l: 'single_vision', u: [], t: 'none' };
const PLANO_PAIR: PairConfig = { v: 502, h: 'marina-oval-sun', l: 'non_rx', u: ['photochromic'], t: 'grey' };

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    slots: [{ id: 's1', slot_index: 0, status: 'available' }, { id: 's2', slot_index: 1, status: 'available' }, { id: 's3', slot_index: 2, status: 'available' }],
    premiumVariantIds: [], reserveFailsFor: [], audits: [], slotUpdates: [],
  };
  createRedemptionFulfillmentOrder.mockImplementation((r: { lens_config: { lens_type: string } }) =>
    Promise.resolve({ orderId: 'ro1', lineItemId: 'rl1', hasRxItems: r.lens_config.lens_type !== 'plano' }));
});

describe('autoRedeemConfiguredPairs', () => {
  it('redeems each configured pair: Rx → awaiting_rx, plano → awaiting_fulfillment', async () => {
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 2, fallbacks: 0 });
    const statuses = state.slotUpdates.filter((u) => u.patch.internal_order_id).map((u) => u.patch.status);
    expect(statuses).toEqual(['awaiting_rx', 'awaiting_fulfillment']);
  });

  it('passes the plano lens vocabulary to the synthesized order', async () => {
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    await autoRedeemConfiguredPairs([PLANO_PAIR], CTX, stubSupabase() as never);
    expect(createRedemptionFulfillmentOrder.mock.calls[0][0].lens_config.lens_type).toBe('plano');
  });

  it('out-of-stock pair falls back: slot reverted, audit written, others continue', async () => {
    state.reserveFailsFor = [501];
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
    expect(state.audits[0]).toMatchObject({ action: 'auto_redeem_pair_failed' });
    expect((state.audits[0].after_data as { reason: string }).reason).toBe('out_of_stock');
    const revert = state.slotUpdates.find((u) => u.patch.status === 'available');
    expect(revert).toBeTruthy();
  });

  it('non-dispensable destination fails ALL pairs closed with audits', async () => {
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], { ...CTX, shipTo: { country_code: 'GB' } }, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 0, fallbacks: 2 });
    expect(state.audits).toHaveLength(2);
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('a throwing pair is audited and does not break the batch', async () => {
    createRedemptionFulfillmentOrder
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ orderId: 'ro2', lineItemId: 'rl2', hasRxItems: false });
    const { autoRedeemConfiguredPairs } = await import('@/features/subscriptions/auto-redeem-pairs');
    const result = await autoRedeemConfiguredPairs([RX_PAIR, PLANO_PAIR], CTX, stubSupabase() as never);
    expect(result).toEqual({ redeemed: 1, fallbacks: 1 });
    expect((state.audits[0].after_data as { reason: string }).reason).toContain('boom');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/features/subscriptions/auto-redeem-pairs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the email template** (`src/lib/email/templates/pair-fallback.ts` — mirror `slot-unlocked.ts`'s exported shape `render*(...): { subject, html, text }`):

```ts
// src/lib/email/templates/pair-fallback.ts
export function renderPairFallback(params: { memberName: string; manageUrl: string; count: number }): {
  subject: string; html: string; text: string;
} {
  const pairWord = params.count === 1 ? 'one of your configured pairs' : `${params.count} of your configured pairs`;
  const subject = 'Action needed: pick a new frame for your membership pair';
  const text = `Hi ${params.memberName},\n\nGood news: your GlassyVision membership is active. However, ${pairWord} could not be started (the frame just sold out or could not ship to your address). The pair is back in your account as an open slot — pick any other frame whenever you like:\n${params.manageUrl}\n\nIf you paid for lens upgrades on that pair, our team will reach out about a refund or credit.\n\n— GlassyVision`;
  const html = `<p>Hi ${params.memberName},</p><p>Good news: your GlassyVision membership is active. However, ${pairWord} could not be started (the frame just sold out or could not ship to your address). The pair is back in your account as an open slot — pick any other frame whenever you like.</p><p><a href="${params.manageUrl}">Choose a new frame →</a></p><p>If you paid for lens upgrades on that pair, our team will reach out about a refund or credit.</p><p>— GlassyVision</p>`;
  return { subject, html, text };
}
```

- [ ] **Step 4: Write the lib**

```ts
// src/features/subscriptions/auto-redeem-pairs.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRedemptionFulfillmentOrder } from '@/features/subscriptions/redemption-order';
import { pairRedemptionLensConfig, type PairConfig } from '@/features/subscriptions/lib/pair-config';
import { isDispensableDestination } from '@/lib/rx/market';
import { sendEmail } from '@/lib/email/resend';
import { renderPairFallback } from '@/lib/email/templates/pair-fallback';

export interface AutoRedeemContext {
  membershipId: string;
  orderId: string;
  customerId: string | null;
  customerEmail: string | null;
  currency: string | null;
  shipTo: Record<string, unknown> | null;
}

/**
 * Server-side redemption of purchase-time configured pairs, run from webhook
 * provisioning. Mirrors startRedemption's claim → reserve → synthesize steps
 * WITHOUT its auth/IDOR layer (the paid order is the authorization) and
 * WITHOUT the surcharge fork (upgrades were paid in the membership order).
 *
 * FAIL-SAFE PER PAIR: any failure reverts that pair to an open slot, writes an
 * audit_log row, and continues — a membership always provisions fully.
 */
export async function autoRedeemConfiguredPairs(
  configs: PairConfig[],
  ctx: AutoRedeemContext,
  supabase: SupabaseClient,
): Promise<{ redeemed: number; fallbacks: number }> {
  let redeemed = 0;
  let fallbacks = 0;

  const audit = async (pairIndex: number, config: PairConfig, reason: string) => {
    fallbacks += 1;
    const { error } = await supabase.from('audit_log').insert({
      user_id: null,
      action: 'auto_redeem_pair_failed',
      entity_type: 'subscription_memberships',
      entity_id: ctx.membershipId,
      after_data: {
        order_id: ctx.orderId, pair_index: pairIndex,
        frame_variant_id: config.v, handle: config.h, reason,
      } as never,
    });
    if (error) console.error('[auto-redeem] audit insert failed', error);
  };

  // Destination gate up front: Rx/eyewear dispensing is US/CA only. A bad
  // destination fails EVERY pair closed (slots remain open, membership stands).
  if (!ctx.shipTo || !isDispensableDestination(ctx.shipTo, null)) {
    for (let i = 0; i < configs.length; i++) await audit(i + 1, configs[i], 'destination_not_dispensable');
    await maybeSendFallbackEmail(ctx, fallbacks, supabase);
    return { redeemed: 0, fallbacks };
  }

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    let claimedSlotId: string | null = null;
    try {
      // 1. Lowest-index available slot for this membership.
      const { data: slots } = await supabase
        .from('subscription_redemptions')
        .select('id, slot_index, status')
        .eq('membership_id', ctx.membershipId)
        .eq('status', 'available')
        .order('slot_index', { ascending: true })
        .limit(1);
      const slot = (slots ?? [])[0] as { id: string } | undefined;
      if (!slot) { await audit(i + 1, config, 'no_available_slot'); continue; }

      // 2. Premium flag (record-keeping; the surcharge was already paid).
      const { data: meta } = await supabase
        .from('product_metadata')
        .select('subscription_tier')
        .eq('shopify_variant_id', config.v)
        .maybeSingle();
      const isPremium = (meta as { subscription_tier?: string | null } | null)?.subscription_tier === 'premium';

      const lensConfig = pairRedemptionLensConfig(config);

      // 3. Atomic claim (same conditional update as startRedemption).
      const { data: claimed } = await supabase
        .from('subscription_redemptions')
        .update({
          status: 'locked',
          frame_variant_id: config.v,
          lens_config: lensConfig as never,
          ship_to: ctx.shipTo as never,
          expected_surcharge: 0,
          is_premium: isPremium,
        })
        .eq('id', slot.id)
        .eq('status', 'available')
        .select('id');
      if (!claimed || claimed.length === 0) { await audit(i + 1, config, 'slot_claim_race'); continue; }
      claimedSlotId = slot.id;

      // 4. Atomic inventory reserve; out-of-stock reverts the slot.
      const { data: reservedPoolId, error: reserveErr } = await supabase.rpc('reserve_inventory_unit', {
        p_variant_id: config.v,
        p_reason: 'subscription_reserved',
        p_redemption_id: slot.id,
        p_notes: `Purchase-time configuration for membership ${ctx.membershipId}`,
      });
      if (reserveErr || !reservedPoolId) {
        await revertSlot(slot.id, supabase);
        claimedSlotId = null;
        await audit(i + 1, config, 'out_of_stock');
        continue;
      }

      // 5. Synthesized fulfillment order → existing Rx → review → lab pipeline.
      const { orderId, lineItemId, hasRxItems } = await createRedemptionFulfillmentOrder(
        {
          id: slot.id,
          frame_variant_id: config.v,
          lens_config: lensConfig,
          ship_to: ctx.shipTo,
          membership: { customer_id: ctx.customerId, customer_email: ctx.customerEmail, currency: ctx.currency },
        },
        supabase,
      );

      await supabase
        .from('subscription_redemptions')
        .update({
          status: hasRxItems ? 'awaiting_rx' : 'awaiting_fulfillment',
          internal_order_id: orderId,
          internal_line_item_id: lineItemId,
          redeemed_at: new Date().toISOString(),
        })
        .eq('id', slot.id);
      redeemed += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_error';
      if (claimedSlotId) await revertSlot(claimedSlotId, supabase).catch(() => undefined);
      await audit(i + 1, config, reason);
    }
  }

  await maybeSendFallbackEmail(ctx, fallbacks, supabase);
  return { redeemed, fallbacks };
}

/** Mirror startRedemption's revert: clear all per-pick config so no stale PII remains. */
async function revertSlot(slotId: string, supabase: SupabaseClient): Promise<void> {
  await supabase
    .from('subscription_redemptions')
    .update({
      status: 'available',
      frame_variant_id: null,
      expected_surcharge: 0,
      is_premium: false,
      lens_config: {} as never,
      ship_to: null,
    })
    .eq('id', slotId);
}

/** Best-effort, comm-deduped on (type, membership) like provisioning's emails. */
async function maybeSendFallbackEmail(ctx: AutoRedeemContext, fallbacks: number, supabase: SupabaseClient): Promise<void> {
  if (fallbacks === 0 || !ctx.customerEmail) return;
  try {
    const { data: prior } = await supabase
      .from('communications')
      .select('metadata, status')
      .eq('type', 'pair_fallback')
      .eq('direction', 'outbound');
    const already = ((prior ?? []) as Array<{ metadata: unknown; status: string }>).some(
      (c) => c.status !== 'failed' && (c.metadata as { membership_id?: string } | null)?.membership_id === ctx.membershipId,
    );
    if (already) return;
    const { data: claimed } = await supabase
      .from('communications')
      .insert({
        order_id: null, customer_email: ctx.customerEmail, type: 'pair_fallback',
        direction: 'outbound', channel: 'email', provider: 'resend',
        subject: 'Action needed: pick a new frame for your membership pair',
        status: 'queued', metadata: { membership_id: ctx.membershipId },
      })
      .select('id')
      .single();
    if (!claimed) return;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://glassyvision.com';
    const rendered = renderPairFallback({ memberName: 'there', manageUrl: `${baseUrl}/account/subscription`, count: fallbacks });
    const result = await sendEmail({ to: ctx.customerEmail, subject: rendered.subject, html: rendered.html, text: rendered.text });
    await supabase
      .from('communications')
      .update(result.success ? { status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.providerMessageId } : { status: 'failed' })
      .eq('id', (claimed as { id: string }).id);
  } catch (err) {
    console.error('[auto-redeem] fallback email failed (non-gating)', err);
  }
}
```

- [ ] **Step 5: Run tests, lint, commit**

Run: `npx vitest run tests/features/subscriptions/auto-redeem-pairs.test.ts` → PASS (5 tests). Then `npm test` → full suite green.

```bash
npm run lint && git add src/features/subscriptions/auto-redeem-pairs.ts src/lib/email/templates/pair-fallback.ts tests/features/subscriptions/auto-redeem-pairs.test.ts
git commit -m "feat(subscriptions): server-side auto-redeem of purchase-time configured pairs"
```

---

### Task 7: Provisioning integration

**Files:**
- Modify: `src/features/subscriptions/provision-membership.ts`
- Modify: `src/app/api/shopify/webhooks/route.ts:131` (only if `orderRow` lacks `shipping_address` — extend the row selection, do not restructure)
- Test: extend the existing provisioning test file (locate with `grep -rln "provisionMembershipFromOrder" tests/`)

**Interfaces:**
- Consumes: `autoRedeemConfiguredPairs` (Task 6), `parsePairProperty`-produced `pair_configs` jsonb (Tasks 2/4), `validatePairConfigs` (Task 1 — re-validated at read: DB content is not trusted blindly).
- Produces: after slot creation, configured pairs are redeemed; `slot_unlocked` email only sent when open slots remain.

- [ ] **Step 1: Write the failing tests** (add to the existing provisioning test file, mirroring its OrderRow/supabase fixtures):

```ts
it('auto-redeems configured pairs after provisioning and skips slot_unlocked when none remain', async () => {
  // membership line fixture carries pair_configs for all 3 pairs (SUB-3PAIR)
  // assert: autoRedeemConfiguredPairs called once with 3 configs and
  // { membershipId, orderId: order.id, shipTo: order.shipping_address };
  // assert slot_unlocked comm NOT created.
});

it('sends slot_unlocked when some pairs remain open (1 configured of 3)', async () => {
  // pair_configs length 1 → autoRedeem called with 1; slot_unlocked comm IS created.
});

it('invalid pair_configs json in DB provisions membership with all slots open (fail-safe)', async () => {
  // pair_configs: [{"v":"bad"}] → validate fails → autoRedeem NOT called, no throw,
  // membership + 3 slots created, audit row 'auto_redeem_configs_invalid' written.
});

it('duplicate delivery does not auto-redeem twice (idempotency short-circuit)', async () => {
  // second call returns { provisioned:false } before slots/auto-redeem.
});
```

Write these as full tests against that file's existing stub — the file already fakes `subscription_plans`, `order_line_items`, `subscription_memberships`, and `communications`; extend its `order_line_items` fixture with `pair_configs` and mock `@/features/subscriptions/auto-redeem-pairs` with `vi.mock` (assert on call args). Follow its established builder helpers exactly.

- [ ] **Step 2: Run to verify the new cases fail**

Run: `npx vitest run <provisioning test file>`
Expected: new cases FAIL.

- [ ] **Step 3: Implement**

In `provision-membership.ts`:
- Extend `OrderRow` with `shipping_address?: Record<string, unknown> | null`.
- Extend the line-items select to `'variant_id, product_id, sku, pair_configs'`.
- After the `subscription_redemptions` slot insert and BEFORE `sendProvisioningEmails`, add:

```ts
  // Purchase-time configured pairs: auto-redeem them through the existing
  // redemption pipeline. Re-validate — DB jsonb is not trusted blindly.
  let openSlots = plan.pairs_count;
  const membershipLine = (lineItems ?? []).find((li) => (li.sku ?? '').startsWith('SUB-')) as
    | { pair_configs?: unknown }
    | undefined;
  if (membershipLine?.pair_configs) {
    const validated = validatePairConfigs(membershipLine.pair_configs, plan.pairs_count);
    if (!validated.ok) {
      await supabase.from('audit_log').insert({
        user_id: null,
        action: 'auto_redeem_configs_invalid',
        entity_type: 'subscription_memberships',
        entity_id: membership.id,
        after_data: { order_id: order.id, reason: validated.error } as never,
      });
    } else if (validated.configs.length > 0) {
      const { redeemed } = await autoRedeemConfiguredPairs(validated.configs, {
        membershipId: membership.id,
        orderId: order.id,
        customerId: order.customer_id,
        customerEmail: order.customer_email ?? null,
        currency: membershipCurrency,
        shipTo: order.shipping_address ?? null,
      }, supabase);
      openSlots = plan.pairs_count - redeemed;
    }
  }
```

Where `membershipCurrency` is the same normalized value inserted on the membership row — extract it to a const before the insert:

```ts
  const membershipCurrency = (order.currency ?? 'usd').toLowerCase() === 'cad' ? 'cad' : 'usd';
```

Change the email call to gate `slot_unlocked` on remaining open slots:

```ts
    await sendProvisioningEmails(order, membership.id, plan.pairs_count, allImmediate && openSlots > 0, supabase);
```

(The fourth parameter already gates only the `slot_unlocked` send; the welcome email always goes.)

New imports: `validatePairConfigs` from the codec, `autoRedeemConfiguredPairs` from Task 6.

In `src/app/api/shopify/webhooks/route.ts`, inspect how `orderRow` is built for the `provisionMembershipFromOrder(orderRow, supabase)` call at line 131; if it does not already include `shipping_address`, add it to the row selection/shape (the orders table stores it as jsonb — Task 4 confirmed `shipping_address: (payload.shipping_address ?? null)` in sync).

- [ ] **Step 4: Run the provisioning file + full suite**

Run: `npx vitest run <provisioning test file> && npm test`
Expected: PASS all.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint && git add src/features/subscriptions/provision-membership.ts src/app/api/shopify/webhooks/route.ts <provisioning test file>
git commit -m "feat(subscriptions): provisioning auto-redeems purchase-time configured pairs"
```

---

### Task 8: Builder data assembly (server)

**Files:**
- Create: `src/features/subscriptions/lib/builder-data.ts`
- Test: `tests/features/subscriptions/builder-data.test.ts`

**Interfaces:**
- Consumes: `getProducts` (existing `@/lib/commerce/shopify`), `getLensUpgradePricing`, `getFrameSurchargePricing`, `getMembershipPricing`, `createAdminClient`.
- Produces (Tasks 9–11):

```ts
export interface BuilderFrame {
  handle: string; title: string; image: string | null;
  variantId: number;               // numeric id for PairConfig.v
  price: number;                   // regular price (display context only)
  premium: boolean;
}
export interface BuilderData {
  tiers: MembershipPricing;                    // existing type (null = fail closed)
  frames: BuilderFrame[];                      // excludes membership/lens-upgrades/frame-surcharges
  lensPricing: LensPricingMap | null;          // existing type
  surcharge: FrameSurchargePrice | null;       // Task 3 type
}
export async function getBuilderData(): Promise<BuilderData>
```

Rules: frames whose handle is in `['membership', 'lens-upgrades', 'frame-surcharges']` are excluded; a frame with no parseable numeric variant id is excluded (it cannot become a valid `PairConfig.v`); `premium` from one `product_metadata` `.in()` query over the frames' variant ids. Every fetch failure degrades that field to `null`/`[]` — the builder disables what it cannot price (upgrades unavailable → paid options disabled; surcharge null → premium frames unselectable; tiers null → builder blocked with the existing unavailable notice).

- [ ] **Step 1: Write the failing tests** — mock the four pricing/product functions + admin client (same `vi.mock` style as Task 5's test); cases: (1) happy path assembles frames with premium flags; (2) excluded handles absent; (3) surcharge fetch failure → `surcharge: null` while frames still return; (4) product with unparseable variant id dropped. Full test code in the same structure as `tests/api/checkout-pair-configs.test.ts`'s mocks (write it out — 4 `it()` blocks).

- [ ] **Step 2: Run to verify FAIL, Step 3: implement per the interface above** (the `ShopifyProduct` shape from `mapProduct` has `variants` — derive `variantId` from the first variant's gid via `Number(gid.split('/').pop())`), **Step 4: run to PASS (4 tests), Step 5: lint + commit**

```bash
npm run lint && git add src/features/subscriptions/lib/builder-data.ts tests/features/subscriptions/builder-data.test.ts
git commit -m "feat(membership): builder data assembly (frames, premium flags, live pricing)"
```

---

### Task 9: Builder state + route shell

**Files:**
- Create: `src/features/subscriptions/builder/BuilderContext.tsx` (client: reducer over `{ tier: 'solo'|'duo'|'trio' | null; pairs: Array<PairConfig | null> }`, localStorage persistence under `gv_builder_v1`, actions `setTier` (resizes pairs array to tier pairs, preserving prefix), `setPair(index, config)`, `clearPair(index)`, `reset`)
- Create: `src/app/(site)/membership/build/page.tsx` (server: `getBuilderData()` + active-membership check identical to `/membership`'s → redirect members to `/account/subscription`; renders `<PlanBuilder data={...} initialTier={searchParams.tier}/>`)
- Create: `src/features/subscriptions/builder/PlanBuilder.tsx` (client shell: step indicator `01 PLAN / 02 PAIRS / 03 REVIEW`, tier selector reusing live tier prices, pair cards grid with `[Configure this pair]` / `[Decide later — redeem anytime this year]`, renders Task 10's configurator inline for the active pair, Task 11's review/checkout below)
- Modify: `src/features/subscriptions/components/MembershipTierTable.tsx` — CTA changes from `MembershipCTA` post to a `Link` → `/membership/build?tier=<tier>` (keep `canBuy` gating; keep the component fail-closed rendering)
- Test: `tests/features/subscriptions/builder-state.test.ts` (pure reducer tests — export the reducer separately from the context file)

Reducer test cases (write in full): setTier trio → 3 null pairs; downgrade trio→solo with 2 configured → keeps pair 1 only; setPair/clearPair round-trip; reset clears. Components carry no logic beyond the tested reducer + codec.

- [ ] Steps: failing reducer tests → FAIL → implement reducer+context → PASS → build components (type-check gate: `npx tsc --noEmit`) → wire tier table link → `npm test` full green → lint + commit

```bash
npm run lint && git add src/features/subscriptions/builder/ "src/app/(site)/membership/build/page.tsx" src/features/subscriptions/components/MembershipTierTable.tsx tests/features/subscriptions/builder-state.test.ts
git commit -m "feat(membership): plan builder shell, state, and tier entry"
```

---

### Task 10: Pair configurator component

**Files:**
- Create: `src/features/subscriptions/builder/PairConfigurator.tsx` (client)
- Create: `src/features/subscriptions/builder/pair-pricing.ts` (pure) + Test: `tests/features/subscriptions/pair-pricing.test.ts`

**Interfaces:**
- Consumes: `BuilderData` slices as props (`frames`, `lensPricing`, `surcharge`), codec (`chargeableOptionIds`).
- Produces: `<PairConfigurator frames lensPricing surcharge value onDone onCancel />` returning a `PairConfig` via `onDone`; and the pure pricing helper Tasks 10–11 share:

```ts
export function pairAddonTotal(
  config: PairConfig, premium: boolean,
  lensPricing: LensPricingMap | null, surcharge: FrameSurchargePrice | null,
): number | null   // null = something chargeable is unpriceable (UI must disable/block)
```

UI (Pair-style mechanics, our tokens): numbered sub-steps — 1 FRAME (searchable grid of `BuilderFrame` cards; premium chip shows live `+$<surcharge.price>`; surcharge null → premium cards disabled with "temporarily unavailable"), 2 LENSES (covered group labeled `INCLUDED IN YOUR PLAN`: non-Rx, blue-light, single-vision; paid group with live prices: progressive, photochromic, tints; default = single-vision, nothing paid; Rx note: "you'll upload your prescription after checkout — takes a minute"), 3 summary chip (`onDone`). Unpriceable paid option (missing in `lensPricing`) → its control disabled. Honest labels only — descriptive chips (`FOR SCREENS`, `DRIVES LIKE SUNGLASSES`), no fabricated stats.

`pairAddonTotal` tests (write in full, 5 cases): covered-only pair → 0; progressive+grey → 190; premium adds surcharge price; missing lensPricing entry → null; premium with null surcharge → null.

- [ ] Steps: failing pricing tests → FAIL → implement `pair-pricing.ts` → PASS → build `PairConfigurator` (type-check gate) → full `npm test` → lint + commit

```bash
npm run lint && git add src/features/subscriptions/builder/PairConfigurator.tsx src/features/subscriptions/builder/pair-pricing.ts tests/features/subscriptions/pair-pricing.test.ts
git commit -m "feat(membership): pair configurator with live covered/paid pricing"
```

---

### Task 11: Review step, sticky total, checkout POST

**Files:**
- Create: `src/features/subscriptions/builder/BuilderReview.tsx` (client)
- Create: `src/features/subscriptions/builder/BuilderStickyTotal.tsx` (client)
- Test: `tests/features/subscriptions/builder-totals.test.ts`

**Interfaces:**
- Consumes: builder state, `pairAddonTotal` (Task 10), tier price from `BuilderData.tiers`.
- Produces: pure `builderTotals(state, data): { tierPrice: number; addons: number; total: number; perPairAllIn: number; blocked: boolean } | null` (null when tiers null; `blocked` true when any configured pair's `pairAddonTotal` is null — checkout button disabled with notice); `BuilderReview` renders per-pair summary lines (`PAIR 02 — OPEN SLOT · redeem anytime`), the risk-reversal strip (prorated refunds · no auto-renew · slots live 12 months + grace), and the checkout button which POSTs to `/checkout` with the membership `CartLine` (tier variant, `lensConfig: { lensType: 'non_rx', coatings: [], tint: 'none' }`, `pairConfigs`) — same fetch/redirect/error pattern as `MembershipCTA` (copy its `busy`/`error` handling verbatim). `BuilderStickyTotal` shows the running total + `perPairAllIn` on mobile.

`builderTotals` tests (write in full, 4 cases): zero-config totals = tier price; mixed pairs sum addon totals; blocked propagation; null tiers → null.

- [ ] Steps: failing totals tests → FAIL → implement → PASS → components (type-check) → full `npm test` → lint + commit

```bash
npm run lint && git add src/features/subscriptions/builder/BuilderReview.tsx src/features/subscriptions/builder/BuilderStickyTotal.tsx tests/features/subscriptions/builder-totals.test.ts
git commit -m "feat(membership): builder review, sticky running total, configured checkout"
```

---

### Task 12: Admin fallback queue surface

**Files:**
- Modify: `src/app/admin/memberships/page.tsx` — add a "Pair fallbacks needing attention" section above the memberships list: query `audit_log` where `action = 'auto_redeem_pair_failed'`, newest first, limit 20; render membership id (linked to `/admin/memberships/[id]`), pair index, frame handle, reason, created_at; empty state "None — all configured pairs provisioned cleanly."
- Test: `tests/features/admin/pair-fallback-queue.test.ts` — pure formatter `formatFallbackRow(entry): { membershipId, pairIndex, handle, reason, when }` extracted to `src/features/admin/lib/pair-fallbacks.ts`; 3 test cases (well-formed entry; missing after_data fields degrade to '—'; ordering left to the query).

- [ ] Steps: failing formatter tests → FAIL → implement formatter + page section → PASS → full `npm test` → lint + commit

```bash
npm run lint && git add src/app/admin/memberships/page.tsx src/features/admin/lib/pair-fallbacks.ts tests/features/admin/pair-fallback-queue.test.ts
git commit -m "feat(admin): surface auto-redeem pair fallbacks for manual refund/credit"
```

---

### Task 13: Full verification, visual pass, launch checklist

**Files:** none in-repo (screenshots to the session scratchpad; checklist appended to the plan's PR/report).

- [ ] **Step 1:** `npm run lint && npm test && npx next build --webpack` — expect lint clean, **all tests green (574 + ~45 new)**, build compiles all routes (Turbopack broken locally, pre-existing).
- [ ] **Step 2 (visual):** `npm run dev`, screenshot `/membership` (tier CTAs now link to builder), `/membership/build?tier=trio` (three pair cards, configurator open, sticky total), mobile 390px + desktop 1440px; read the screenshots and verify: no horizontal overflow, live prices shown, premium chip renders, covered group labeled INCLUDED. Kill the dev server.
- [ ] **Step 3 (fail-closed spot checks):** with Storefront env broken (backup + restore `.env.local` exactly as in the funnel plan's Task 12): builder blocks with unavailable notice, zero dollar figures; restore env and confirm.
- [ ] **Step 4 (launch checklist — report, do not execute merchant steps):**
  1. Apply migration 00046 to cloud (`supabase db push`).
  2. Run `scripts/setup-frame-surcharges.js`; publish `frame-surcharges` to the headless channel.
  3. Set `product_metadata.subscription_tier='premium'` + surcharge variant id/price for premium frames.
  4. Reprice tiers in Shopify: Solo $109 / Duo $179 / Trio $219 (per spec §Business goal).
  5. Enable Bogus Gateway → E2E: builder → checkout (card `1`) → webhook → slots redeemed (`awaiting_rx`/`awaiting_fulfillment`), Rx-upload email received, fallback path exercised by configuring an out-of-stock frame.
  6. Re-validate all pricing when the lab COGS quote lands.
- [ ] **Step 5:** Final commit of any stragglers; dispatch external code review per CLAUDE.md (subagent-driven flow's final review satisfies this).

Done criteria (sprint contract): all tests green with output shown; webpack build succeeds; screenshots reviewed; fail-closed checks pass; zero hardcoded prices in new code (`grep -rn '\$[0-9]' src/features/subscriptions/builder src/lib/commerce/frame-surcharge-pricing.ts` → nothing); launch checklist delivered.
