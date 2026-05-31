# Subscription Core — Sub-project 1 Design

- **Status:** Approved (brainstorm complete). Ready for implementation plan.
- **Date:** 2026-05-31
- **Parent:** [`2026-05-31-subscription-overview-design.md`](./2026-05-31-subscription-overview-design.md) (sub-project 1). Builds on sub-project 0 (customer accounts, merged) — uses `getCurrentCustomer()`, `customers.auth_user_id`, customer RLS.
- **Goal:** Sell a prepaid annual subscription and fulfill its pairs through the existing Rx→review→lab→ship pipeline.

## 1. Scope (locked)

**IN:** one seeded plan (3 pairs / 12 months / all-immediate / expire-policy); membership auto-provisioned on the Shopify purchase webhook (idempotent, paid-gated); all 3 pairs redeemable immediately; redemption of **covered AND paid (premium frame + lens upgrade) pairs** via a second Shopify checkout with amount verification, a `pending_payment` slot state, inventory reservation + an abandoned-checkout sweeper; synthesized internal order per redemption (Keystone 1) flowing through the existing pipeline; a functional `/account/subscription` dashboard + redemption screens.

**DEFERRED:** admin plan-builder UI (plan seeded via migration); multi-plan; refund/dispute webhooks + end-of-term refund logic (a later money pass); "reuse stored Rx" convenience (each redemption uses the existing rx-intake flow); visual polish.

## 2. Data model & Keystone-1 migration

**Existing-table changes (the bridge):**
- `orders.shopify_order_id` → nullable; drop plain unique, add partial unique index `where shopify_order_id is not null`; add `order_source` enum `('shopify','subscription')` default `'shopify'`.
- `order_line_items.shopify_line_item_id` → nullable.
- `product_metadata`: add `subscription_tier` (`included`|`premium`, default `included`) + `subscription_surcharge_variant_id bigint` (Shopify variant representing a premium frame's surcharge).
- `inventory_adjustments`: add reason value `subscription_reserved`.
- No change to `create-shipment`'s Shopify push — already guarded on a truthy `shopify_line_item_id`, so synthesized orders skip it.

**New tables:**
- `subscription_plans` — `name`, `pairs_count` (3), `term_months` (12), `billing_mode` ('prepaid'), `redemption_policy` jsonb (`{mode:'all_immediate'}`), `end_of_term_policy` jsonb (`{mode:'expire', reminder_days:[60,30,7], grace_days:14}`), `shopify_product_id`, `shopify_variant_id`, `status`. **One row seeded** (product id from `SUBSCRIPTION_MEMBERSHIP_PRODUCT_ID` env, set post-deploy).
- `subscription_memberships` — `plan_id`, `customer_id`, `shopify_order_id` (**unique**), `status` (`active`/`grace`/`expired`/`cancelled`/`refunded`/`frozen`), `term_start`, `term_end`, frozen `pairs_total` + `redemption_policy` + `end_of_term_policy`, `next_renewal_at` (null). Partial unique `customer_id where status in ('active','grace')`.
- `subscription_redemptions` — `membership_id`, `slot_index` (unique per membership; pre-materialized N rows), `status` (state machine §4), `unlocks_at`, `frame_variant_id`, `is_premium`, `lens_config` jsonb, `ship_to` jsonb, `expected_surcharge` numeric default 0, `add_on_shopify_order_id`, `internal_order_id`/`internal_line_item_id`, `rx_file_id`, `rx_review_id`, `work_order_id`, `retention_anchor` date, `redeemed_at`, `pending_payment_expires_at`.
- `subscription_addon_options` — `key`, `label`, `shopify_variant_id`, `price`, `lens_effect` jsonb, `active`. Seeded starter set (progressive, blue-light, anti-glare, high-index, photochromic/polarized); seller sets variant ids once the Shopify products exist.

**RLS:** customer reads own `subscription_memberships`/`subscription_redemptions` via `current_customer_id()`; all writes service-role.

## 3. Provisioning (purchase webhook)

`provisionMembershipFromOrder(order, supabase)` (`src/features/subscriptions/`), called from the webhook route after `sync.ts` when an order line item matches an active plan's `shopify_product_id`:
- **Idempotent + paid-gated:** only when `financial_status='paid'`; keyed on `memberships.shopify_order_id` unique + `ON CONFLICT DO NOTHING`. Add the `orders/paid` topic to the webhook switch.
- Insert membership (`term_start=now`, `term_end=+term_months`, frozen plan snapshot); pre-materialize `pairs_count` redemption rows `status='available'`, `unlocks_at=now` (all-immediate).
- Membership product is `is_rx_required=false` (no awaiting-Rx reminder on the purchase).
- Linked to `customer_id`; appears on the dashboard once the buyer logs in (verified-email bind from sub-project 0).

## 4. Redemption flow & state machine

**States:** `available → locked → pending_payment → awaiting_rx → in_review → in_production → shipped → delivered`; `cancelled`/`expired` (only from `available`/`locked`); `rx_rejected → awaiting_rx`. `$0` covered pairs skip `pending_payment`.

1. **`startRedemption(slotId, frameVariantId, lensConfig, shipTo)`** (server action, requires `getCurrentCustomer`; verifies the slot's membership belongs to the caller).
2. **Atomic claim:** `UPDATE … SET status='locked', frame_variant_id, lens_config, ship_to, expected_surcharge WHERE id=$slot AND status='available' AND unlocks_at<=now RETURNING id`; zero rows → error.
3. **Reserve inventory:** `inventory_adjustments` (`subscription_reserved`, −1) guarded by `pool_quantity>=0`; out of stock → release lock + error. Drop/limited frames are excluded from subscription eligibility (`subscription_tier` not set on them, or an explicit exclude flag).
4. **Surcharge fork:** `expected_surcharge = premium_surcharge + Σ lens_option.price`.
   - `0` → create synthesized order → `awaiting_rx` (or skip Rx for plain sunglasses → work order).
   - `>0` → `status='pending_payment'`, `pending_payment_expires_at=now+60min`; build Shopify add-on cart (`createCart`) from surcharge variants with a `redemption_id` line-item attribute; return `checkoutUrl`.
5. **Add-on paid webhook** (`orders/paid`): extend `sync.ts` to capture the `redemption_id` line-item property; match a `pending_payment` redemption; **verify paid amount ≥ `expected_surcharge`**; store `add_on_shopify_order_id`; create synthesized order → `awaiting_rx`.
6. **Abandon sweeper** (cron, reuse the existing cron auth pattern): redemptions in `pending_payment` past `pending_payment_expires_at` → `available`, release the inventory reservation.
7. **Synthesized order (Keystone 1):** `order_source='subscription'`, `shopify_order_id=null`, `customer_id`, `customer_email`, `billing_country` + `shipping_address` from `ship_to` (drives the destination market gate), `currency` from the membership; one `order_line_items` row (frame sku/shape/color/size from `product_metadata`, lens config). Link `internal_order_id`/`internal_line_item_id`.
8. **Rx + fulfillment:** Rx pairs enter the existing `rx-intake` flow against the synthesized order (image required; manual admin review; unexpired-cert). Non-Rx pairs skip to `generateWorkOrder`. Then existing `generateWorkOrder` → lab kanban → `createShipment` (which enforces ship-gate expiration + destination market from sub-project 0.5). Redemption status mirrors at transitions; `retention_anchor` set at ship.

## 5. Dashboard & UI

- **`/account/subscription`** (server component, `getCurrentCustomer`, redirect to login if none): membership status + expiry countdown; `pairs_count` slot cards — `available` → "Use a pair"; in-flight → Rx/lab/shipment status reusing the `/track` stepper component; `shipped` → tracking; add-on receipts (links to the Shopify add-on orders).
- **Redemption screens:** frame picker (eligible frames where `subscription_tier` set + in stock), lens-option picker (from `subscription_addon_options`), ship-to address form → `startRedemption` → either proceed (covered) or redirect to the add-on `checkoutUrl`.
- Link the dashboard from `/account` (replace the placeholder "Subscription" card).

## 6. Compliance (inherited + per-redemption)

- Per-redemption Rx: image required before approval, manual review, unexpired cert — via the existing pipeline against the synthesized order.
- Destination market gate (US/CA) on each redemption's `ship_to` (sub-project 0.5).
- Rx expiration re-checked at the ship gate (sub-project 0.5).
- 3-year retention anchored at each redemption's ship date (`retention_anchor`).
- FDA per-shipment: each redemption ships independently → its own shipment record (existing `shipments`).

## 7. Testing (TDD) — done criteria

- Provisioning: idempotent (duplicate webhook → one membership), paid-gated (pending → no provision), pre-materializes N slots.
- Atomic slot claim: concurrent claim → exactly one wins.
- Surcharge: $0 path skips payment; `>0` builds cart + sets `pending_payment` + `expected_surcharge`.
- Add-on webhook: amount ≥ expected → advances; amount < expected → rejected/no advance; unknown `redemption_id` → no-op.
- Abandon sweeper: stale `pending_payment` → `available` + reservation released.
- Synthesized order: correct `order_source`, null shopify ids, frame spec + ship-to populated; flows through `generateWorkOrder`/`createShipment`.
- RLS: customer reads only own memberships/redemptions; cannot read another's.
- Full suite green, lint + tsc clean; external code review; security review of the money/redemption surface.

## 8. Open items for planning

- Exact membership product / add-on variant ids (seller-created in Shopify; supplied via env / one-time row updates) — config, not code.
- Lens-option starter set finalization (mock defaults until real SKUs exist).
- Ship-to: reuse a saved address later (sub-project 0 deferred saved addresses); for now collected per redemption.
