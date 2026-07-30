# Lens Upgrade Charging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge for lens upgrades via hidden Shopify add-on line items paired to frame lines, with Shopify-owned pricing, fail-closed behavior, and work orders that carry the actually-purchased lens spec.

**Architecture:** Per `docs/superpowers/specs/2026-07-29-lens-upgrade-charging-design.md`. A hidden `lens-upgrades` product supplies one variant per option (SKU-keyed `LENSUP-*`). The server-side `/checkout` route resolves selected options to variants and appends paired add-on lines (`line_ref`/`_addon_for` UUID pairing). Webhook sync persists the pairing + the frame's lens selection into new `order_line_items` columns; fulfillment paths exclude add-on lines; work-order generation reads the real spec instead of hardcoding.

**Tech Stack:** Next.js 16 route handlers + server components, Shopify Storefront/Admin REST APIs, Supabase migration 00045, Vitest.

## Global Constraints

- Prices come from Shopify only; no dollar amounts remain in `src/features/shop/lens-options.ts`.
- Fail closed: unresolvable paid upgrade → PDP option disabled, cart checkout blocked, `/checkout` returns 409. Never silently drop a paid upgrade.
- Add-on lines must NEVER enter the Rx pipeline, the non-Rx fulfillment queue, or work-order generation.
- SKU prefix `LENSUP-` is the stable join key; option ids: `single_vision, progressive, ar, blue_light, photochromic, grey, amber, green`.
- TDD, `npm run lint` before each commit, HEREDOC commit messages, migration number 00045.

---

### Task 1: Migration 00045 + sync persists pairing and lens selection

**Files:**
- Create: `supabase/migrations/00045_lens_addon_line_items.sql`
- Modify: `src/lib/commerce/sync.ts:199-261` (property parse + insert)
- Modify: `src/lib/supabase/types.ts` (order_line_items Row/Insert/Update get the 5 new columns)
- Test: `tests/lib/commerce/sync-lens-addons.test.ts` (create, mirroring `sync-rx-pipeline.test.ts` mock conventions)

**Interfaces:**
- Produces: `order_line_items` columns `line_ref text`, `addon_for_ref text`, `lens_type text`, `coatings text`, `tint text`. Sync rule: a line with property `_addon_for` (normalized `addonfor`) OR `sku` starting `LENSUP-` is an add-on → `addon_for_ref` set (property value or `'sku'` fallback), `is_rx_required=false` always. Frame lines persist `line_ref`, `lens_type`, `coatings` (CSV), `tint` from properties.

- [ ] **Step 1: Migration**

```sql
-- 00045_lens_addon_line_items.sql
-- Lens upgrades are now charged as separate Shopify line items paired to
-- their frame line (spec 2026-07-29-lens-upgrade-charging-design.md).
alter table order_line_items
  add column if not exists line_ref text,
  add column if not exists addon_for_ref text,
  add column if not exists lens_type text,
  add column if not exists coatings text,
  add column if not exists tint text;
comment on column order_line_items.line_ref is 'UUID minted at checkout on frame lines; add-on lines reference it via addon_for_ref';
comment on column order_line_items.addon_for_ref is 'Non-null marks this line as a lens-upgrade add-on (never fulfilled standalone)';
```

- [ ] **Step 2: Failing tests** — cases: (a) frame line with properties `line_ref/lens_type/coatings/tint` persists all four + `is_rx_required` true for progressive; (b) line with `_addon_for` property → `addon_for_ref` set, `is_rx_required` false even if a stray `is_rx_required=true` property is present; (c) line with SKU `LENSUP-AR` and no properties → `addon_for_ref='sku'`; (d) add-on lines do not set `has_rx_items` on the order.
- [ ] **Step 3: Run tests** — expect FAIL (columns not written).
- [ ] **Step 4: Implement in sync.ts** — inside the property loop add:

```ts
          if (name === 'lineref') lineRef = prop.value;
          if (name === 'addonfor') addonForRef = prop.value;
          if (name === 'lenstype') lensTypeRaw = prop.value;      // keep existing isRxRequired logic
          if (name === 'coatings') coatingsRaw = prop.value;
          if (name === 'tint') tintRaw = prop.value;
```

after the loop:

```ts
      const isAddon = addonForRef !== null || (item.sku ?? '').startsWith('LENSUP-');
      if (isAddon) {
        addonForRef = addonForRef ?? 'sku';
        isRxRequired = false; // add-ons never enter the Rx pipeline
      }
```

and extend the insert object with `line_ref, addon_for_ref, lens_type, coatings, tint` (null for add-ons except `addon_for_ref`). `hasRxItems` must be computed AFTER the add-on override.
- [ ] **Step 5: types.ts** — add the five columns (`string | null`) to order_line_items Row/Insert/Update.
- [ ] **Step 6: Apply migration locally** — `npx supabase db reset` (all 45 apply).
- [ ] **Step 7: Full sync-test pass** — `npx vitest run tests/lib/commerce/` PASS.
- [ ] **Step 8: Commit** — `feat(sync): persist lens add-on pairing + selection (migration 00045)`.

### Task 2: Live pricing module + public price route

**Files:**
- Create: `src/lib/commerce/lens-pricing.ts`
- Create: `src/app/api/lens-pricing/route.ts`
- Test: `tests/lib/commerce/lens-pricing.test.ts`

**Interfaces:**
- Produces:
```ts
export interface LensUpgradePrice { optionId: string; variantId: string; price: number; currencyCode: string }
export type LensPricingMap = Record<string, LensUpgradePrice>;
export const LENS_UPGRADES_HANDLE = 'lens-upgrades';
export const LENSUP_SKU_PREFIX = 'LENSUP-';
export const getLensUpgradePricing: () => Promise<LensPricingMap | null>; // React cache()d
export function skuToOptionId(sku: string): string | null; // LENSUP-TINT_GREY -> grey, LENSUP-AR -> ar
```
- SKU→option mapping: strip prefix; `TINT_X` → lowercase x; else lowercase remainder (`SINGLE_VISION` → `single_vision`).

- [ ] **Step 1: Failing tests** — mock `storefrontFetch` (vi.mock `@/lib/commerce/shopify-storefront`): builds map keyed by optionId from variant SKUs/prices; returns null when product missing; skuToOptionId unit cases incl. unknown prefix → null.
- [ ] **Step 2: Implement** — query:

```graphql
query LensUpgrades($handle: String!) {
  productByHandle(handle: $handle) {
    variants(first: 20) { edges { node { id sku price { amount currencyCode } } } }
  }
}
```
`cache()`-wrapped async fn; on missing product or fetch error → `console.error('[lens-pricing] lens-upgrades product unavailable — paid upgrades fail closed', ...)` and return null. Route handler: `export const revalidate = 300;` returns `{ pricing: map }` or `{ pricing: null }` (200 either way; client treats null as unavailable).
- [ ] **Step 3: Tests pass, lint, commit** — `feat(commerce): live lens upgrade pricing from Shopify (fail-closed)`.

### Task 3: Checkout appends paired add-on lines (fail closed)

**Files:**
- Modify: `src/app/checkout/route.ts`
- Test: `tests/api/checkout/route.test.ts` (create)

**Interfaces:**
- Consumes: `getLensUpgradePricing`, `LensPricingMap` from Task 2.
- Produces: cartCreate lines = for each frame line `{merchandiseId, quantity, attributes:[...existing, {key:'line_ref', value:<uuid>}]}` plus per selected paid option `{merchandiseId: <upgrade variantId>, quantity: <frame qty>, attributes:[{key:'_addon_for', value:<uuid>}, {key:'is_rx_required', value:'false'}]}`. Selected options = lensType (if not `non_rx`) + each coating + tint (if not `none`). Missing option in map → 409 `{ error: 'Lens upgrade pricing is unavailable — please try again shortly' }`.

- [ ] **Step 1: Failing tests** — mock `createCart` + `getLensUpgradePricing`. Cases: (a) frame + progressive + ar + grey → 4 lines, add-ons carry `_addon_for` equal to frame's `line_ref`, quantities match frame qty 2; (b) non_rx clear frame → 1 line, no ref needed but `line_ref` still present; (c) pricing null + paid selection → 409, `createCart` not called; (d) pricing missing one selected option → 409.
- [ ] **Step 2: Implement** — build helper `selectedOptionIds(config: LensConfig): string[]` in `lens-options.ts` (pure, testable): `[...(config.lensType !== 'non_rx' ? [config.lensType] : []), ...config.coatings, ...(config.tint !== 'none' ? [config.tint] : [])]`.
- [ ] **Step 3: Pass, lint, commit** — `feat(checkout): charge lens upgrades as paired add-on line items`.

### Task 4: Exclude add-ons from non-Rx fulfillment

**Files:**
- Modify: `src/features/admin/lib/non-rx-queue.ts:37-39` (add `.is('addon_for_ref', null)`)
- Modify: `src/features/admin/actions/generate-non-rx-work-order.ts` (guard: refuse line items with `addon_for_ref`, error `'Add-on line items are not fulfillable'`)
- Test: extend `tests/features/admin/non-rx-queue.test.ts` + `tests/features/admin/generate-non-rx-work-order.test.ts`

- [ ] Steps: failing tests (queue query includes the `.is` filter — assert via mock chain; generator returns the error for an add-on line) → implement → pass → commit `fix(admin): lens add-on lines never enter non-Rx fulfillment`.

### Task 5: Work orders carry the purchased lens spec

**Files:**
- Modify: `src/features/admin/actions/generate-work-order.ts:103-136`
- Modify: `src/features/admin/actions/generate-non-rx-work-order.ts` (tint/coatings from line)
- Test: extend `tests/features/admin/generate-work-order.test.ts`

**Interfaces:**
- Select `lens_type, coatings, tint` in the line-item embed. Mapping in `generate-work-order.ts`:

```ts
const LENS_TYPE_MAP: Record<string, LensType> = { single_vision: 'single_vision', progressive: 'progressive' };
const mapped = LENS_TYPE_MAP[lineItem.lens_type ?? ''];
if (!mapped) {
  return { success: false, error: `Cannot generate work order: unknown lens type '${lineItem.lens_type ?? 'missing'}' on line item` };
}
```
`coatings` CSV → `string[]` (empty for null/'none'); `tint` → line value or `'none'`. Non-Rx path: `lens_type: 'non_prescription'` unchanged, but coatings/tint now from the line item.

- [ ] Steps: failing tests (progressive line → work order lens_type progressive + coatings ['ar','blue_light'] + tint grey; missing lens_type → loud error; non-Rx tint passthrough) → implement → pass (update any existing fixtures that omit lens_type — they must now include `lens_type: 'single_vision'` to keep passing, which is itself the proof of the gate) → commit `fix(admin): work orders carry purchased lens spec, never a hardcoded default`.

### Task 6: UI — live prices, fail-closed selection, cart breakdown

**Files:**
- Modify: `src/features/shop/lens-options.ts` (drop priceDelta/lensDelta; add `selectedOptionIds`)
- Modify: `src/features/shop/LensPicker.tsx`, `src/features/shop/PdpConfigurator.tsx` (accept `pricing: LensPricingMap | null` prop; render `+${'$'}{pricing[o.id].price}` or "unavailable"+disabled for paid options when absent)
- Modify: PDP server page (`src/app/(site)/p/[handle]/page.tsx` or actual path — locate via `grep -rl PdpConfigurator src/app`) to fetch and pass pricing
- Modify: `src/context/CartContext.tsx` + `src/features/cart/CartClient.tsx` + `src/features/cart/CartLineItem.tsx`: fetch `/api/lens-pricing` client-side once; subtotal includes upgrade prices; per-line breakdown rows; checkout button disabled (with notice) when pricing null and any line has paid upgrades
- Test: `tests/features/shop/lens-options.test.ts` (selectedOptionIds; assert module exports no numeric prices)

- [ ] Steps: failing test for `selectedOptionIds` → implement module change → wire components (visual change; verify via `npm run build` + existing tests) → pass → commit `feat(shop): live lens pricing in PDP/cart, fail-closed when unavailable`.

### Task 7: Shopify setup script (idempotent)

**Files:**
- Create: `scripts/setup-lens-addons.js` (CommonJS, `node --env-file=.env.local scripts/setup-lens-addons.js`, uses `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_ACCESS_TOKEN`, REST Admin API `2024-07` same version as `shopify-admin.ts`)

Behavior: GET product by handle; if missing, POST product `{title:'Lens Upgrades', handle:'lens-upgrades', status:'active', tags:'internal-addon', variants:[...8 variants with sku/price/option1 label, inventory_management:null, requires_shipping:false, taxable:true]}`. If present, create only missing SKUs via POST variant; NEVER update existing prices. Print a table of resulting variant ids/prices. Exit non-zero on API error.

- [ ] Steps: write script → run against the dev store (`node --env-file=.env.local scripts/setup-lens-addons.js`) → verify via Storefront fetch (`getLensUpgradePricing` returns 8 entries) → commit `feat(scripts): idempotent lens-upgrades product bootstrap`.
- Note: if the dev store token lacks write_products scope, script prints the exact scope to grant and exits 1 — commit anyway, run post-grant.

### Task 8: Verification + external review

- [ ] `npm run test` all pass; `npm run lint` clean; `npm run build` succeeds; `npx supabase db reset` applies 45 migrations.
- [ ] Manual smoke via dev server if store configured: PDP shows live prices; checkout redirect carries add-on lines (inspect cartCreate response lines count).
- [ ] Dispatch `feature-dev:code-reviewer` on `git diff main@{start}` scope (this feature's commits); fix confirmed findings.
- [ ] Update `docs/qa/2026-05-31-test-scenarios.md` pricing scenarios if they assert frame-only totals.

## Deliberately out of scope
Per spec: no lens materials/index options, no auto-refund bundling, no historical backfill, no subscription surcharge changes.
