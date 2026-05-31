# GlassyVision Subscription — Overview Design & Decomposition

- **Status:** Approved in principle (brainstorm complete); decomposed into sub-projects, each needing its own spec → plan → build.
- **Date:** 2026-05-31
- **Supersedes/relates:** [`2026-04-11-glassyvision-phase1-design.md`](./2026-04-11-glassyvision-phase1-design.md) (subscription was "phase 2, out of scope" there), [`2026-04-17-rx-intake-design.md`](./2026-04-17-rx-intake-design.md).
- **Why this doc exists:** The subscription is GlassyVision's headline product. A four-agent adversarial review of the happy-path design (compliance, money/Shopify, data-model/state, account/auth) surfaced enough structural gaps that the work is too large for one spec. This doc captures the locked decisions, the architectural keystones, the full gap register, and the build sequencing. It is the umbrella; sub-projects get their own specs.

---

## 1. Product vision (locked decisions)

A **prepaid annual subscription** alongside one-off sales. Customer pays once (~$100–200, price TBD) for a **membership** granting **3 pairs over ~12 months**. Every pair is prescription-capable, so redemptions thread the existing Rx → review → lab → ship pipeline.

The through-line of every decision below: **maximum seller configurability.** A *plan* is a configurable template; a *membership* is one customer's purchased instance; a *redemption* is one pair being claimed.

| Decision | Locked choice |
|---|---|
| **Billing model** | **Prepaid annual bundle.** One-time Shopify checkout for a "membership" product. No selling plans, no subscription app. |
| **Card handling** | **Never vaulted by us.** Always the payment provider / POS processor. Keeps PCI scope out. |
| **Recurring** | **Recurring-ready, not recurring-now.** `billing_mode` + `next_renewal_at` exist but inert. Provider-managed auto-renew is a later config flip, not a rebuild. |
| **Redemption timing** | **Plan-level policy, seller picks per plan:** `spaced` (cadence) / `all_immediate` / `bank`. Stored on the plan + frozen onto the membership at purchase. |
| **Coverage / "upgrade = add-on"** | Default: included frame tier + standard lens covered; **premium frames + lens upgrades are paid add-ons** via a separate Shopify checkout. **Fully seller-configurable per item** (every frame tagged included/premium+surcharge; every lens option priced), riding on existing `product_metadata`. |
| **End-of-term (unredeemed pairs)** | **Plan-level policy, seller picks:** `expire` (after reminder cadence + admin grace) / `rollover` / `refund`. Refund mode routes through Shopify's money path. |
| **Commerce approach** | **Approach A — Shopify for money only; Supabase owns entitlements.** Membership purchase + add-on payments are Shopify orders; the entitlement/redemption ledger lives in Supabase; redemptions reuse the existing fulfillment pipeline. Lowest lock-in, cheapest, recurring-ready. |

---

## 2. Architecture — the two keystones

Almost every gap below traces to one of these two facts. Get these right and most of the rest follows.

### Keystone 1 — Synthesize an internal order + line item per redemption
The entire downstream pipeline (`work_orders`, `rx_files`, the `create-shipment` gate, `returns`) is hard-bound to a Shopify `order_id` + `line_item_id` (NOT NULL). A redemption has neither, so **as first designed a redeemed pair cannot generate a work order or pass the ship gate.**

**Decision:** when a pair is locked, **synthesize a zero-value internal order + line item** for that redemption. Then work-order generation, the Rx-image invariant, the lab dashboard/kanban, shipment push, and returns all work unchanged per pair. This is far less invasive than making `order_id`/`line_item_id` nullable and auditing every consumer for null handling.

### Keystone 2 — Real customer auth (this is the prerequisite sub-project)
Today: staff-only Supabase Auth; customers are an unauthenticated CRM mirror (`customers` has no `auth_user_id`); customer "auth" is an HMAC order#+token in a URL with no revocation; `/track` and `/thanks` have no auth and are guessable by order number. **Acceptable for a one-shot guest Rx upload; unacceptable for a 12-month entitlement managed across devices.**

**Decision:** build customer accounts FIRST as sub-project 0:
- **Supabase Auth email magic-link (OTP)** for customers, identity **separate from staff `profiles`** (so customers can't satisfy `has_role` checks; note `safe_default_role` defends staff routes).
- **Post-purchase claim flow**: `/thanks` → magic link to the verified checkout email → on first login bind `customers.auth_user_id = auth.uid()`. Handle auth-email ≠ checkout-email via admin-mediated merge, never silent email re-match.
- **First customer-facing RLS policies** in the codebase (a customer reads only their own membership/redemptions; all status mutations stay service-role).

---

## 3. Data model sketch (Supabase)

New tables (detailed schema belongs in the sub-project specs):

- **`subscription_plans`** — configurable template. `pairs_count` (default 3), `term_months` (default 12), `billing_mode` (`prepaid`|`recurring`), `redemption_policy` jsonb (`{mode: spaced|all_immediate|bank, cadence}`), `end_of_term_policy` jsonb (`{mode: expire|rollover|refund, reminder_cadence, grace_days}`), `shopify_product_id`, `markets`, `status`.
- **`subscription_memberships`** — `plan_id`, `customer_id`, `shopify_order_id` (unique), `status` (`active`/`grace`/`expired`/`cancelled`/`refunded`/`frozen`), `term_start`, `term_end`, **frozen term snapshot** (`pairs_total`, `redemption_policy`, `end_of_term_policy` copied at purchase — plans are mutable templates for *new* memberships only), `next_renewal_at` (null now — the recurring seam).
- **`subscription_redemptions`** — the ledger; **one row pre-materialized per slot at membership creation** (makes "redeemed" derivable, no counter drift, and bounds redemptions to N via `UNIQUE(membership_id, slot_index)`). `slot_index`, `status` (see §4 state machine), `unlocks_at`, `frame_variant_id`, `is_premium`, `lens_config` jsonb, `add_on_shopify_order_id`, `internal_order_id`/`internal_line_item_id` (Keystone 1), `rx_file_id`, `rx_review_id`, `work_order_id`, `retention_anchor` (ship date).

Coverage config rides on existing `product_metadata`. Add `customers.auth_user_id` (Keystone 2).

---

## 4. The gap register

Severity from the four-agent review. ★ = independently flagged by multiple agents (higher confidence). Each maps to a sub-project (§6).

### Compliance / Rx
- **★ CRITICAL — Expiration checked only at intake, never at ship.** A 12-month membership guarantees stale-Rx dispensing. Enforce `rx_expiration_date >= today` at the **shipment gate** (and re-collect the unexpired-cert checkbox at **each** redemption, not once at purchase). *Also a latent bug today — see §5.*
- **CRITICAL — Market gate uses `billing_country`, not shipping destination.** A US subscriber can ship an Rx pair to a UK address and the gate passes. Gate on each redemption's **ship-to** country; the current `billing_country` CHECK (`us`/`ca` only) can't even represent a UK address to block it. *Also a latent bug today — see §5.*
- **CRITICAL — "Reuse stored Rx" has no schema support** and could slip an unreviewed/typed-only/expired Rx to the lab. Must be an explicit **reviewed carry-forward** (copy image + checksum, re-affirmed/again-unexpired approval, customer-email match).
- **IMPORTANT — Retention anchor per redemption ship date**, not membership purchase; a membership refund must **not** purge records for pairs already dispensed.
- **IMPORTANT — FDA Class I import entry is per shipment** — one membership = up to 3 separate filings; don't collapse to one.
- **IMPORTANT — Per-redemption Rx-required + market determination** (plain sunglasses vs Rx pair differ on UK eligibility); `has_rx_items` is computed once at order sync today and can't express per-pair.
- **NICE — Membership product must be `is_rx_required=false`** so the awaiting-Rx reminder cron doesn't pester at purchase.

### Money / Shopify
- **★ CRITICAL — No `refunds/create` / `disputes/*` webhooks.** A refund issued in the Shopify admin never reaches Supabase → customer refunded but slots stay redeemable = free glasses. On parent-order dispute, freeze the membership.
- **★ CRITICAL — Provisioning must be idempotent + gated on `financial_status='paid'`**, keyed on `shopify_order_id` (`ON CONFLICT DO NOTHING`) — else every `orders/updated` mints another 3 slots. Add the `orders/paid` topic.
- **★ CRITICAL — Add-on order → slot linkage** isn't supported by the current write path, **and must verify the paid amount equals the expected surcharge** (else a $5 add-on unlocks a $200 premium pair). Create the redemption `pending_payment` first with a server-generated id; match the webhook on it + verify amount.
- **IMPORTANT — Refund math from Shopify's actual captured amount**, never a mirrored `plan.price` (no-hardcoded-prices rule); account for discount codes / gift cards. Existing `createRefund` has a pre-existing over-refund bug (hardcoded `shipping:0`, no calculate-refund call).
- **IMPORTANT — Tax frozen at purchase** but goods ship later — accountant decision; store the tax basis on the membership.
- **IMPORTANT — Recurring seam is more than two columns:** auto-renew later needs a provider charge API + vault token, a `renewal_attempts` ledger, dunning comm types + cadence, and a renewal webhook. Document so "flip a flag" expectations are calibrated.
- **NICE — currency/multi-market** (USD/CAD membership variants; currency-lock the membership), GDPR `customers/redact` webhook (unhandled today).

### State / concurrency / abuse
- **★ CRITICAL — No optimistic locking anywhere in the codebase** → double-redeem race. Use atomic `UPDATE … WHERE status='available' RETURNING`; pre-materialize one row per slot; `UNIQUE(membership_id, slot_index)`.
- **CRITICAL — `pending_payment` state** for premium/add-on pairs, gated on the add-on `orders/paid` webhook before the pair reaches the lab.
- **CRITICAL — Abandoned add-on checkout** strands slot + frame; inventory has **no reservation concept**. Add a `reserved` state + TTL sweeper cron; reserve inventory on lock (`inventory_adjustments` reason `subscription_reserved`).
- **CRITICAL — Chargeback abuse** (pay $100, redeem 3 premium day-one, dispute): default `spaced`, enforce `unlocks_at` server-side, freeze membership on dispute, audit every transition.
- **IMPORTANT — Expiry-cron vs in-flight invariant:** expiry acts only on `available`/`locked`; any committed slot (`pending_rx`+) runs to completion. A membership may not be `expired` while a slot is committed (enforce via trigger).
- **IMPORTANT — Single-lab capacity:** `all_immediate` or December expiry-rush swamps one edger. Bias default to `spaced`, use `lab_jobs.priority` (subscription < retail), rate-limit work-order release, surface backlog.
- **IMPORTANT — Freeze plan terms at purchase** (snapshot onto membership); plan governs new memberships only; define renewal slot regeneration + rollover.
- **IMPORTANT — Returns/remakes:** add `returns.redemption_id`; our-fault remake must NOT burn the slot; define slot accounting per reason.
- **IMPORTANT — Soft cap** `UNIQUE(customer_id) WHERE status IN ('active','grace')`; bind redemption ship-to to the customer of record (anti-resale/share).
- **State machine — missing redemption states:** `pending_payment`, split `awaiting_rx` vs `pending_rx` (so the cron can target un-uploaded pairs), `rx_rejected` loop, `delivered`, `returned`/`remake`, and distinct `cancelled_by_admin` / `refunded` / `expired`. Membership: `frozen`/`disputed`.

### Account / auth / lifecycle (sub-project 0 + 3)
- **★ CRITICAL — No customer auth model** (Keystone 2).
- **★ CRITICAL — No reconciliation** between Shopify checkout email, Supabase auth user, and `customers` (today: email-string match only). Risk of orphaned/mis-claimed memberships. → claim flow.
- **CRITICAL — GDPR account-deletion vs 3-year Rx retention conflict:** anonymize PII but retain Rx in restricted storage; wire `customers/redact`.
- **IMPORTANT — Undefined lifecycle flows:** cancel (pro-rata refund, admin), pause/extend, mid-term address change, update-Rx-between-pairs, expiry-with-unredeemed-pairs (what the subscriber sees), renewal/re-subscribe claim.
- **IMPORTANT — Dashboard spec** `/account/subscription`: slot cards + status, unlock dates, per-pair Rx status + reject reasons, shipment tracking (reuse the `/track` stepper component), add-on receipts, expiry countdown.
- **IMPORTANT — Year-long notification timeline:** new `comm_type`s (`membership_welcome`, `slot_unlocked`, `pair_shipped`, `expiry_warning`, `renewal_offer`); extend the reminder cron (cadence engine reusable, selection query is not).
- **NICE — eligibility/gating decision** (open vs invite/drop/waitlist — brand has the infra); lost-email recovery; **gift/transfer** (if in scope, the claim flow needs a gift code decoupled from purchaser email from day one — painful to retrofit).

---

## 5. Latent bugs to fix NOW on the hardening branch

Independent of subscriptions; the multi-month redemption window only makes them acute. Fix on `feature/compliance-hardening` (TDD) before merge:

1. **Rx expiration enforced at the shipment gate**, not only at intake (`create-shipment` / `generate-work-order`).
2. **Market gate on shipping destination**, not `billing_country`.

---

## 6. Decomposition & build sequence

Each sub-project = its own spec → plan → build → external code review.

- **0 — Customer accounts (prerequisite, build first).** Magic-link auth separate from staff; `customers.auth_user_id`; post-purchase claim; first customer RLS; `/account` + `/account/subscription` shell. GDPR-vs-retention deletion policy.
- **0.5 — Latent compliance fixes** (§5) — on the hardening branch, now.
- **1 — Subscription core.** Plans/memberships/redemptions tables; Keystone-1 synthesized-order bridge; pre-materialized slots + atomic claim; redemption flow reusing the pipeline; per-redemption Rx + market + expiration gates.
- **2 — Prepaid money hardening.** `orders/paid` + `refunds/create` + `disputes/*` webhooks; idempotent paid-gated provisioning; add-on linkage + amount verification; reservation state + abandon sweeper; refund math from Shopify.
- **3 — Lifecycle + admin.** Cancel/refund, expiry-policy engine (`expire`/`rollover`/`refund`), grace, reminders/comm types, admin plan-builder + membership management dashboard.

---

## 7. Open decisions (carry forward)

- Membership **price** (~$100 vs $200) and per-pair value allocation — founder + accountant.
- **Tax treatment** of a prepaid bundle (taxable good at purchase vs deferred) — accountant.
- **Eligibility/gating:** open join vs invite/drop/waitlist.
- **Gift/transfer** in scope for phase 1? (Decides claim-flow shape — decide before sub-project 0 build.)
- **Markets:** subscription is Rx-capable → US/CA only in phase 1; UK excluded until optician retained (a UK sunglasses-only membership is possible later).

## 8. Out of scope / YAGNI (phase 1)

- Recurring auto-renew billing (seam only).
- Membership `paused` state (reserve enum room; no logic now).
- Cross-currency add-ons within one membership.
