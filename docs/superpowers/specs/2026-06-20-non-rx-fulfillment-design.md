# Non-Rx Fulfillment Path — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorming complete; ready for implementation plan)
**Branch context:** follows `fix/e2e-audit-2026-06-12` (all audit criticals + HIGH fixed)
**Related:** subscription-core spec §4.7 (the unimplemented "non-Rx pairs skip to `generateWorkOrder`"); E2E audit 2026-06-12 §3 (non-Rx redemption dead-end, HIGH) and the deferred-gaps note in §9.

---

## 1. Problem

Non-prescription items (plain/plano sunglasses; covered subscription pairs the member chose plano lenses for) **cannot be fulfilled**. Three hard blocks, all consequences of the Rx-compliance hardening:

1. **`work_orders.rx_file_id` is `NOT NULL`** (migration `00024`, the core compliance invariant) — the schema rejects any work order without an Rx image.
2. **`generateWorkOrder(rxFileId)` is keyed entirely on an Rx file** (`src/features/admin/actions/generate-work-order.ts:32`) — there is no entry point that produces a work order for an item that has no prescription.
3. **`createShipment` hard-requires `wo.rx_file_id`** (`src/features/lab/actions/create-shipment.ts:58`) — even if a non-Rx work order existed, it could never ship.

Two sources feed the gap:

- **Storefront non-Rx orders.** A paid sunglasses/plano order mirrors into Supabase with `has_rx_items=false, rx_status='none'`, then dead-ends — no work order path, never reaches the lab, never ships.
- **Subscription non-Rx redemptions.** `createRedemptionFulfillmentOrder` already correctly computes `has_rx_items=false` for a plano pair, but `start-redemption` then **unconditionally stamps the redemption `awaiting_rx`** (`start-redemption.ts:205`). `awaiting_rx` is in the *committed* set of `guard_membership_terminal`, so the redemption is stuck forever (no Rx will ever arrive to advance it) **and** the membership can never reach `expired`/`refunded`/`cancelled` while that slot is committed. This is the audit HIGH.

Both faces share one root cause: work-order generation and the ship gate are Rx-keyed. Fixing that root once closes both.

## 2. Goals / Non-goals

**Goals**
- A non-Rx item (storefront or subscription) can flow all the way to **shipped** through the **existing** lab kanban, QC, ship, and Shopify-fulfillment machinery.
- The FTC compliance invariant — *every Rx work order has an Rx image on file* — is preserved **exactly**, now expressed conditionally rather than as a blanket constraint.
- A non-Rx redemption no longer strands its membership lifecycle.
- A lightweight admin checkpoint gates the lab (no Rx review, just a release click).

**Non-goals (YAGNI)**
- No change to the Rx pipeline behavior for Rx items.
- No UK / non-US-CA market expansion for non-Rx. Phase 1 ships US/CA only for *all* items; the storefront only sells to US/CA. UK sunglasses-only is a phase-2 concern, explicitly out of scope.
- No fix to the pre-existing "order `fulfillment_status` set to `shipped` when the first of several work orders ships" quirk in `createShipment` — not introduced by this work.
- No lens-upgrade monetization (separate deferred decision).

## 3. Approach (chosen: A — conditional invariant)

Make `work_orders.rx_file_id` nullable again and replace the blanket `NOT NULL` with a **conditional** CHECK keyed on a new `requires_rx` flag. Reuse the entire downstream pipeline (kanban → QC → `createShipment` → Shopify fulfillment); branch only where Rx-specific logic lives.

Rejected alternatives:
- **B — separate non-Rx fulfillment table + parallel lab path.** Duplicates kanban/QC/ship/audit/Shopify-fulfillment; two ship paths to keep correct forever; contradicts subscription-core §4.7's stated reuse.
- **C — sentinel "no-Rx" pseudo `rx_files` row.** Pollutes the compliance-critical `rx_files` table, corrupts 3-year retention semantics, and the ship gate's image-existence check would need a bypass anyway.

## 4. Schema changes (single migration `00036_non_rx_fulfillment.sql`)

1. **`work_orders.requires_rx boolean not null default true`.** Default `true` is safe: every existing row is an Rx work order.
2. **`work_orders.rx_file_id` → drop `NOT NULL`.**
3. **Replace the invariant with a conditional CHECK:**
   ```sql
   alter table work_orders
     add constraint work_orders_rx_image_required
     check (requires_rx = false or rx_file_id is not null);
   ```
   Reads as: *an Rx work order must have an Rx image; a non-Rx work order may have none.* The compliance guarantee is unchanged for Rx items.
4. **Partial unique index for non-Rx idempotency:**
   ```sql
   create unique index work_orders_non_rx_line_item_uniq
     on work_orders(line_item_id) where requires_rx = false;
   ```
   (The Rx path keys idempotency on `rx_file_id`; non-Rx keys on `line_item_id`.)
5. **New redemption status `awaiting_fulfillment`:**
   ```sql
   alter type redemption_status add value if not exists 'awaiting_fulfillment';
   ```
   Add it to the **committed set** in `guard_membership_terminal` (migration `00031`) and to the expiry cron's `COMMITTED_STATUSES`. A non-Rx redemption with a synthesized order + reserved inventory is committed, so the membership must not be terminally transitioned while it is in flight.

> Note: `alter type ... add value` cannot run inside the same transaction that later uses the new value in some Postgres versions. The migration adds the enum value first; the guard-function and any data use go in a separate statement/migration step as needed.

## 5. Application changes

### 5.1 `generateNonRxWorkOrder(lineItemId)` — new server action
Sibling to `generateWorkOrder`. Admin-gated (`getCurrentUser` + `isAdminRole`; derives ids from the session, never from parameters — same pattern as the post-audit actions).

Validates:
- the line item's order is paid (`financial_status='paid'`),
- the line item is non-Rx (`is_rx_required=false`),
- destination is dispensable US/CA (`isDispensableDestination`),
- no non-Rx work order already exists for this `line_item_id` (idempotency; returns the existing one if so).

Inserts:
- `work_orders`: `requires_rx=false`, `rx_file_id=null`, `lens_type='non_prescription'`, frame specs from `product_metadata` / the line item, **`released_to_lab_at=now()`** — for non-Rx the admin "release to lab" click and work-order generation collapse into one step (there is no Rx review in between).
- `lab_jobs`: `column='inbox'`.
- `audit_log`: `action='non_rx_work_order_generated'`.

Then calls `advanceRedemptionForOrder(order_id, 'in_production', { workOrderId })` — a no-op for storefront orders (their `order_id` is never a redemption's `internal_order_id`), and the correct advance for a subscription redemption.

### 5.2 `createShipment` — branch on `requires_rx`
Today (`create-shipment.ts:57-69`) every job hard-requires `rx_file_id` + image + approval. Change to:

```text
if (wo.requires_rx) {
  ...existing Rx checks (image present, not deleted, unexpired, approved)...
}
// always:
...released_to_lab_at present...
...QC photos present...   (QC stays mandatory for non-Rx — product decision)
...destination dispensable (US/CA)...
```

All non-Rx-specific gates (release, QC photo, destination) still apply. Only the Rx-image / approval / expiration checks are skipped when `requires_rx=false`.

### 5.3 Subscription redemption fork
The bug: `start-redemption.ts` always sets `awaiting_rx`. Fix: after the synthesized order is created, fork on whether it has Rx items:
- Rx pair → `awaiting_rx` (unchanged).
- Non-Rx pair → `awaiting_fulfillment`.

`createRedemptionFulfillmentOrder` will return `hasRxItems` (it already computes it) so the caller picks the right status without re-deriving. The **same fork** is applied at the other order-creation site, `confirmAddonPayment` — a non-Rx pair can still carry a premium-frame surcharge or lens add-ons and so create its order on the post-payment path.

### 5.4 Admin non-Rx queue — new page + release action
New `/admin` page (mirrors the Rx queue UX). **Line-item-grain** query: paid `order_line_items` with `is_rx_required=false` and **no** work order yet, excluding shipped/cancelled orders. Both sources surface here together — storefront non-Rx line items and redemption synthesized line items. Admin clicks **"Release to lab"** → `generateNonRxWorkOrder(lineItemId)`.

### 5.5 Customer account page
Render `awaiting_fulfillment` as a "Being prepared" state so a non-Rx redemption no longer displays as stuck / no-active-subscription.

## 6. Mixed orders

A single Shopify order with one Rx line item and one non-Rx line item is handled naturally by the per-line-item work-order model (`work_orders.line_item_id`): the Rx line item flows through the Rx queue/review, the non-Rx line item through the non-Rx queue — independent work orders, independent lab jobs, independent ship. No special-casing required.

## 7. Compliance posture (unchanged guarantees)

- **Rx image required before shipment** — preserved exactly. The conditional CHECK still forces `rx_file_id IS NOT NULL` for every `requires_rx=true` work order, and the ship gate still re-validates image + approval + expiration for Rx jobs.
- **Never typed-only Rx** — unaffected; non-Rx items have no typed Rx to mishandle.
- **3-year retention** — unaffected; `rx_files` is not touched by the non-Rx path.
- **US/CA only** — non-Rx ship gate keeps the US/CA destination check in phase 1.

## 8. Testing (TDD — write tests first)

- **CHECK constraint:** rejects an Rx work order (`requires_rx=true`) with null `rx_file_id`; allows a non-Rx work order (`requires_rx=false`) with null `rx_file_id`.
- **`generateNonRxWorkOrder`:** rejects non-admin (403 before any DB write); rejects an Rx line item; rejects a non-dispensable destination; creates a WO with `requires_rx=false` + null `rx_file_id` + a lab job; is idempotent on repeat (no duplicate WO/job — partial unique index + code guard); advances a linked redemption to `in_production`.
- **`createShipment`:** ships a non-Rx job with a QC photo + release + US/CA; **still blocks** a non-Rx job missing a QC photo, missing release, or a non-dispensable destination; Rx path behavior unchanged.
- **Redemption fork:** a covered non-Rx pair lands in `awaiting_fulfillment` (not `awaiting_rx`); a non-Rx surcharge pair lands in `awaiting_fulfillment` after `confirmAddonPayment`.
- **Membership terminal guard:** treats `awaiting_fulfillment` as committed (blocks `expired`/`refunded`/`cancelled` while in flight); once the pair ships, the membership can transition normally.
- **Non-Rx queue query:** returns paid non-Rx line items with no work order; excludes Rx line items, already-released items, and shipped/cancelled orders; surfaces both storefront and redemption line items.

## 9. Done criteria (sprint contract)

- Migration `00036` applies cleanly on top of the current schema; existing Rx work orders satisfy the new CHECK.
- A storefront plano order can be released from the non-Rx queue → lab kanban → QC → shipped, with a Shopify fulfillment push (verified against the dev store at launch).
- A covered non-Rx subscription redemption reaches `shipped` and its membership can then reach end-of-term/cancel/refund normally.
- Full vitest suite green (current baseline 384) + the new tests; eslint + tsc clean.
- External code review (per CLAUDE.md) after implementation.
