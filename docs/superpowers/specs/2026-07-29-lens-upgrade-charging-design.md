# Lens Upgrade Charging — Design Spec

**Date:** 2026-07-29
**Status:** Approved approach (add-on line items) per standing project decision record (`project_lens_upgrade_pricing` memory: "open decision to build add-on line items"); owner pre-authorized implementation.

## Problem

Lens selections (Rx type, coatings, tint) ride into Shopify only as informational line-item properties. The customer pays frame price alone:

- `lensDelta()` in `src/features/shop/lens-options.ts` has **zero consumers** — upgrade prices appear only as "+$X" labels on the PDP picker, never in cart totals or checkout.
- A progressive + photochromic + tint order (~$275 of upgrades) charges $0 beyond the frame. Every Rx order leaks revenue.
- Prices are hardcoded in `lens-options.ts`, violating the project rule "Don't hardcode prices. Pricing lives in Shopify."
- Separately but relatedly, `generate-work-order.ts:115-116` hardcodes `lens_type='single_vision'`, `lens_material='cr39'` — the purchased selection never reaches the lab sheet.

## Decision

**Approach A — hidden add-on product, one line item per selected upgrade, paired to its frame line.** Chosen over (B) folding costs into frame prices (blurs margins; non-Rx buyers subsidize progressive buyers; no per-option tuning) and (C) a per-frame variant matrix (~96+ variants per frame color/size; exceeds Shopify's variant cap; unmaintainable). A is the standard headless pattern: prices editable in Shopify admin without deploys, multi-currency via Shopify Markets, per-line refunds, transparent checkout.

## Components

### 1. Shopify catalog setup — `scripts/setup-lens-addons.js`

Idempotent Node script (run with `node --env-file=.env.local`, same pattern as `scripts/demo-tokens.js`) using the Admin API:

- Product: title "Lens Upgrades", handle `lens-upgrades`, status `active`, tagged `internal-addon`. Not added to any collection (PLPs are collection-driven, so it never lists). Published to the headless sales channel.
- One variant per option, SKU-keyed (SKU is the stable join key between code and Shopify):

| SKU | Option id (code) | Default price |
|---|---|---|
| `LENSUP-SINGLE_VISION` | `single_vision` | $50 |
| `LENSUP-PROGRESSIVE` | `progressive` | $150 |
| `LENSUP-AR` | `ar` | $30 |
| `LENSUP-BLUE_LIGHT` | `blue_light` | $25 |
| `LENSUP-PHOTOCHROMIC` | `photochromic` | $85 |
| `LENSUP-TINT_GREY` | `grey` | $40 |
| `LENSUP-TINT_AMBER` | `amber` | $40 |
| `LENSUP-TINT_GREEN` | `green` | $40 |

- Variants: inventory not tracked, `requires_shipping` false, taxable true.
- Idempotency: look up by handle first; create missing variants only; never overwrite an existing variant's price (merchant edits win).
- Re-runnable against any store (local/staging/prod) — this is the long-term "new environment" bootstrap.

### 2. Live pricing — `src/lib/commerce/lens-pricing.ts`

- `getLensUpgradePricing(): Promise<LensPricingMap | null>` — Storefront API query of product by handle `lens-upgrades`; maps variant SKU → `{ optionId, variantId, price, currencyCode }`. Wrapped in React `cache()` (same dedupe pattern as `getBanners`) + `next: { revalidate: 300 }`.
- Returns `null` when the product is missing/unpublished (logged loudly once per fetch).
- `lens-options.ts` drops `priceDelta` numbers and `lensDelta()`; keeps option ids, labels, descriptions, `rxRequired`. Display components take prices from the pricing map.
- `GET /api/lens-pricing` — thin cached route exposing the map to the client cart (no secrets; public price data).

### 3. Fail-closed selection & checkout

- PDP (`PdpConfigurator`/`LensPicker`): server page fetches the pricing map and passes it down; options render live prices. If the map is `null`, paid options render disabled with "temporarily unavailable" — only free options (`non_rx`, clear tint) selectable. **No pricing → no paid selection → no free-upgrade leak.**
- Cart (`CartClient`): fetches `/api/lens-pricing`; renders per-line upgrade breakdown rows and includes upgrades in the subtotal. If unavailable, shows "upgrade prices confirmed at checkout" and disables checkout for lines with paid upgrades.
- `/checkout` route (server, authoritative): for each frame `CartLine`, re-derives selected upgrades from `lensConfig` **server-side** and resolves their variant ids from `getLensUpgradePricing()`. Builds `cartCreate` input:
  - Frame line: existing attributes + `line_ref: <crypto.randomUUID()>`.
  - Per selected upgrade: `{ merchandiseId: <upgrade variantId>, quantity: <frame quantity>, attributes: [{ _addon_for: <line_ref> }, { is_rx_required: 'false' }] }`.
  - If any selected paid upgrade cannot be resolved → **409** `{ error: 'Lens upgrade pricing is unavailable — please retry shortly' }`. Never silently drop a paid upgrade.

### 4. Order sync — `src/lib/commerce/sync.ts` + migration 00045

Migration `00045_lens_addon_line_items.sql` adds to `order_line_items`:

- `line_ref text` — the UUID minted at checkout (frame lines),
- `addon_for_ref text` — pairing ref (add-on lines),
- `lens_type text`, `coatings text`, `tint text` — the actual purchased selection (frame lines).

Sync changes:
- Parse `line_ref`, `_addon_for` (property-name normalization already strips `_`), `lens_type`, `coatings`, `tint` from properties into the new columns.
- A line is an add-on when `addon_for_ref` is present **or** SKU starts with `LENSUP-` (belt and braces for manually created Shopify orders). Add-ons always persist `is_rx_required=false`.
- `getNonRxQueue` (`src/features/admin/lib/non-rx-queue.ts`) excludes add-on lines — otherwise every coating would appear as a shippable unit in the fulfillment queue.
- `generateNonRxWorkOrder` refuses add-on line items (guard, mirroring the queue filter).

### 5. Work order fidelity — `generate-work-order.ts` (+ non-Rx path)

- Select `lens_type, coatings, tint` from the frame line item.
- Map `lens_type` text → `lens_type` enum: `single_vision` and `progressive` map directly. On the **Rx path** (`generateWorkOrder`) any other/missing value returns an error (surfaced to the admin via reviewRx) — never silently default a prescription spec. On the **non-Rx path** (`generateNonRxWorkOrder`) the value is always `non_prescription`.
- `coatings` CSV → jsonb array on the work order; `tint` → work order `tint` (default `none`).
- `lens_material` remains `cr39` (only material offered — not configurable, so not stored per line).
- Same mapping applied in `generateNonRxWorkOrder` for tinted sunglasses.

### 6. Returns / refunds

No code change phase 1: returns are per-line; add-on lines are visible in the admin return detail via their own line rows, and `createRefund` already caps against Shopify's live suggested refund. Admin judgment covers "return frame → refund its add-ons too" at current volume.

## Error handling summary

| Failure | Behavior |
|---|---|
| `lens-upgrades` product missing/unpublished | PDP disables paid options; cart blocks checkout of paid-upgrade lines; `/checkout` 409s. Loud server log. |
| Upgrade variant deleted but option still coded | Same fail-closed path (SKU missing from map). |
| Manually created Shopify order with LENSUP- lines | Sync links by SKU prefix; no work order/queue entry from add-ons. |
| Rx work order with unmapped lens_type text | `generateWorkOrder` returns error (surfaces in admin via existing reviewRx error path). |

## Testing

- `lens-pricing`: map building from mocked Storefront response; null on missing product.
- `/checkout`: add-on lines appended with correct variant/qty/ref pairing; 409 fail-closed; frame-only carts unchanged.
- `sync`: new columns populated; add-on detection by property and by SKU; `is_rx_required` stays false for add-ons.
- `non-rx-queue` + `generateNonRxWorkOrder`: add-on lines excluded/refused.
- `generate-work-order`: real lens_type/coatings/tint on the work order; loud failure on unmapped type.

## Out of scope (YAGNI)

- Lens material choices, index upgrades (1.67 etc.) — not offered yet.
- Automatic "refund add-ons when frame returned" bundling.
- Migrating historical orders (none in production).
- Subscription redemption lens surcharges — already handled by the separate `confirm-addon-payment` flow.

## Sequencing note (rest of the "missing" list)

This spec is item 1 of 4. Remaining, in order: (2) production deployment — blocked on owner creating cloud Supabase + GCP/Vercel credentials; runbook exists at `docs/launch/2026-07-17-gcp-cloud-run-deployment-plan.md`; (3) Shopify merchant setup — metaobjects scope grant is manual-admin; collection publishing partially scriptable; (4) subscription purchase flow — separate spec exists (`docs/superpowers/specs/` overview), needs its own plan cycle.
