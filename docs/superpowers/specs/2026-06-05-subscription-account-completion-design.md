# Subscription + Account Completion — Design Spec (2026-06-05)

Completes the two deferred subscription sub-projects and the deferred account
gaps. The architecture is already approved in
`2026-05-31-subscription-overview-design.md` (sub-projects **2 — prepaid money
hardening** and **3 — lifecycle + admin**) and
`2026-05-31-subscription-core-design.md` (§"DEFERRED"). This spec consolidates
that approved design into one implementable unit, with the founder's policy
decisions (2026-06-05) baked in.

## 0. Goal

Make the subscription engine **money-safe and lifecycle-complete**, give admins
tools to **manage plans and memberships**, and close the two customer **account
gaps** (one-time order history, saved addresses). After this, the only remaining
subscription work is business config (Shopify products, price) and the phase-2
recurring-billing seam.

## 1. Locked decisions (founder, 2026-06-05)

| Decision | Choice |
|---|---|
| End-of-term, unredeemed pairs | **Engine supports all three modes** (`expire` / `rollover` / `refund`) as per-plan `end_of_term_policy.mode`. Seeded **live** plan defaults to **`refund`** (legally safest; avoids gift-card-expiry / unclaimed-property exposure). *Flagged for sign-off.* |
| Mid-term cancellation | **Admin-only**, **pro-rata refund** of unredeemed pairs via Shopify's money path. No customer self-serve cancel. |
| Scope | **All four areas** (A money hardening, B lifecycle, C admin, D account). |
| Execution | Ultra multi-agent workflow: spec → plan → TDD build + adversarial review. |
| `pause` membership | **Out of scope** (YAGNI) — enum room only, no logic (per overview spec §136). |

## 2. Scope

**In:** Areas A–D below.
**Out (deferred / YAGNI):** recurring auto-billing & re-purchase renewal flow
(phase-2 seam, `next_renewal_at` stays null); membership `pause`/`freeze`-by-user
logic; multi-term rollover with a *new* purchase (rollover lands as a one-time
term extension — see §4.3); "reuse stored Rx" carry-forward (each redemption
keeps using the existing rx-intake flow); insurance/FSA-HSA; tax treatment
(accountant decision).

---

## 3. Area A — Refund / dispute money hardening

**Problem (overview spec §73, §76):** a refund or dispute resolved in the
Shopify admin never reaches Supabase → customer is refunded but slots stay
redeemable = free glasses. And `createRefund` over-refunds (hardcoded
`shipping:{amount:'0.00'}`, no calculate step).

### 3.1 Fix `createRefund` (`src/lib/commerce/shopify-admin.ts`)
- Call `POST /admin/api/{version}/orders/{id}/refunds/calculate.json` first with
  the intended line items / amount; use the **returned `shipping` and
  `refund_line_items`/`transactions`** rather than hardcoding `shipping: 0`.
- Cap the refund at the order's actual captured amount; never refund more than
  Shopify reports captured. Derive amounts from Shopify, never a mirrored
  `plan.price` (no-hardcoded-prices rule).
- Keep the signature backward-compatible for existing callers (returns refund);
  add an internal helper `calculateRefund(orderId, lineItems?)`.

### 3.2 `refunds/create` webhook
- New case in `src/app/api/shopify/webhooks/route.ts` switch (HMAC + the existing
  `webhook_events` idempotency insert).
- On a refund against a **membership purchase order** → set membership
  `status='refunded'`, **expire all uncommitted slots** (`available`/`locked` →
  `expired`); committed slots (`pending_rx`+) run to completion (overview §86).
- On a refund against an **add-on (surcharge) order** → revert that redemption to
  `available`, release inventory (reuse the sweep-abandoned revert path).
- Idempotent; safe no-op for non-subscription orders.

### 3.3 `disputes/create` (chargeback) webhook
- New case. On a dispute against a membership purchase order → set membership
  `status='disputed'` (new enum value, §6) and freeze: block new redemptions
  while disputed. Flag the order for manual admin review. No automatic refund.
- Resolution (`disputes/update` won → revert to prior status; lost → treat as
  refunded) handled in the same handler where the payload allows; otherwise
  surfaced on the admin membership detail for manual action.

---

## 4. Area B — End-of-term + cancellation lifecycle engine

### 4.1 Migration `00031` (foundation — see §6)

### 4.2 Expiry cron — `/api/cron/membership-expiry`
- Reuses the shared `CRON_SECRET` timing-safe auth and the `communications`
  pre-claim/idempotency pattern (like `rx-reminder`).
- Daily (`0 6 * * *` in `vercel.json`).
- **Reminder phase:** for `active` memberships, when `term_end` is within
  `end_of_term_policy.reminder_days` (e.g. `[60,30,7]`), send `expiry_warning`
  (one comm per (membership, day) via the idempotency index).
- **Transition phase:** when `now >= term_end`:
  - Move `active → grace`, set `grace_start = now`.
  - When `now >= term_end + grace_days`, apply the plan's `end_of_term_policy.mode`
    to the still-`grace` membership (see §4.3).
- **Invariant (overview §86):** the cron acts only on memberships whose
  uncommitted slots are `available`/`locked`. A membership may not transition to
  `expired`/`refunded` while any slot is committed (`pending_rx`+); those run to
  completion first (enforced by a DB trigger + a guard in the cron).

### 4.3 End-of-term modes
- **`expire`** — uncommitted slots → `expired`; membership → `expired`. Send
  `renewal_offer`. No money movement.
- **`refund`** *(seeded live default)* — compute pro-rata refund (§4.4) for
  uncommitted slots, issue via fixed `createRefund` against the membership order,
  set slots → `expired`, membership → `refunded`. Send `renewal_offer`.
- **`rollover`** — **one-time term extension**: `term_end += term_months`, slots
  stay `available`, set a `rollover_count` guard (max 1) so it can't extend
  forever. Membership stays `active`. *True multi-term rollover that regenerates
  slots on a new purchase is the phase-2 recurring seam — out of scope.*

### 4.4 Pro-rata refund math (shared by §4.3-refund and §4.5-cancel)
```
uncommitted = slots in {available, locked}
refundable  = captured_amount * (uncommitted_count / pairs_total)
```
- `captured_amount` comes from Shopify (`refunds/calculate.json` / order
  financials), never `plan.price`. Discount codes / gift cards are reflected
  because we use the actual captured figure.
- Already-dispensed and in-flight (committed) pairs are **not** refunded and
  retention records for shipped pairs are **never purged** (overview §67).

### 4.5 Cancellation — admin Server Action `cancelMembership`
- Lives in `src/features/admin/memberships/actions/cancel-membership.ts`.
- Auth: `getCurrentUser()` + `isAdminRole` (same guard as `reviewRx`).
- Computes pro-rata refund (§4.4), calls fixed `createRefund`, expires
  uncommitted slots, sets membership `status='cancelled'`, writes an `audit_log`
  row. Idempotent (only acts if status ∈ {active, grace}).

---

## 5. Area C — Admin plan-builder + membership dashboard

Follows the established admin pattern: server component under `force-dynamic`
layout guard, service-role data fetch, mutations via auth-checked Server Actions
that write `audit_log`.

### 5.1 Plan-builder — `/admin/plans`
- List (`/admin/plans`), create (`/admin/plans/new`), edit
  (`/admin/plans/[id]`). CRUD over `subscription_plans`.
- Edit `name`, `pairs_count`, `term_months`, `redemption_policy`,
  `end_of_term_policy` (mode + reminder_days + grace_days), `markets`, `status`
  (`draft`/`active`/`archived`), and the Shopify product/variant ids.
- **Multi-plan:** provisioning already matches order line items to a plan's
  `shopify_product_id`; this just lets >1 active plan exist. Plans are mutable
  templates for **new** memberships only — existing memberships keep their frozen
  snapshot (overview §51, §88). No edit may rewrite a live membership's terms.

### 5.2 Membership management — `/admin/memberships`
- List with filters (status, plan, expiring-soon). Detail
  (`/admin/memberships/[id]`): frozen terms, term countdown, every slot + its
  status, linked orders.
- Actions: **cancel + refund** (§4.5), manual **expire**, dispute
  **freeze/unfreeze**, resend a lifecycle email. All audit-logged.

---

## 6. Area D — Account: one-time order history + saved addresses

### 6.1 Saved addresses
- Migration `00031`: `customer_saved_addresses(id, customer_id fk, label,
  recipient_name, address jsonb, is_default bool, created_at)`. RLS:
  customer reads/writes own rows (mirror `00027` pattern); one default per
  customer (partial unique).
- Account UI `/account/addresses`: list / add / edit / delete / set-default.
- **Redemption integration:** the redeem flow (`/account/subscription/redeem/...`)
  offers saved addresses as a picker that prefills `ship_to`; manual entry still
  allowed. `startRedemption` is unchanged (still receives a `ship_to`).

### 6.2 One-time order history
- `/account/orders` (currently a stub) lists the authenticated customer's
  **non-subscription** orders (`order_source != 'subscription'`), matched to the
  customer via `customer_id` (and the verified-email linkage from `00027`).
- Shows order number, date, status, line items, and a tracking link reusing the
  existing `/track/[orderId]` view. Read-only.

---

## 7. Migration `00031` (single foundation migration)

1. `comm_type` enum += `membership_welcome`, `slot_unlocked`, `pair_shipped`,
   `expiry_warning`, `renewal_offer`.
2. `membership_status` enum += `disputed`.
3. `subscription_memberships` += `grace_start timestamptz`,
   `renewal_offer_sent_at timestamptz`, `rollover_count int not null default 0`,
   `cancelled_at timestamptz`, `cancel_reason text`.
4. `customer_saved_addresses` table + RLS + indexes.
5. Trigger guarding membership terminal transitions while a slot is committed
   (§4.2 invariant).

Applies cleanly under `supabase db reset` (currently 30 migrations → 31).

## 8. Communications (Area C wiring)

New comm types fire from their lifecycle points (reuse `sendEmail` +
`communications` idempotency index, one template each in
`src/lib/email/templates/`):
- `membership_welcome` — on provisioning (`provisionMembershipFromOrder`).
- `slot_unlocked` — when a redemption becomes `available` past `unlocks_at`
  (all-immediate plans send at provisioning; future spaced plans via cron).
- `pair_shipped` — when a redemption reaches `shipped` (off `createShipment`).
- `expiry_warning` / `renewal_offer` — from the expiry cron (§4.2).

## 9. State machines (additions)

- **Membership:** `active → grace → {expired | refunded}`; `active|grace →
  cancelled` (admin); `active → refunded` (refund webhook); `active|grace →
  disputed → {active | refunded}` (dispute resolve); `rollover` keeps `active`
  (term extended). Terminal states block new redemptions.
- **Redemption:** unchanged set; lifecycle engine only ever drives uncommitted
  `available`/`locked` → `expired`.

## 10. Testing strategy (TDD)

Vitest unit tests (mock Supabase/Shopify, per existing `tests/**/*.test.ts`):
- Pro-rata refund math (§4.4) — boundary cases (0 / all / partial uncommitted,
  discounts, currency).
- `createRefund` calculate-then-refund path; over-refund rejected.
- `refunds/create` + `disputes/create` handlers — slot expiry, idempotency,
  non-subscription no-op, committed-slot protection.
- Expiry cron — reminder selection, grace transition, each end-of-term mode,
  committed-slot guard.
- `cancelMembership` — pro-rata, idempotency, auth.
- Saved-address RLS + redemption prefill; order-history scoping (no leakage
  across customers).
Playwright e2e: admin cancels a membership → refund issued + slots expired;
account adds an address → redeems using it; expiry cron drives a membership to
`refunded`. Gate: `supabase db reset` clean; full unit + e2e green.

## 11. Build phasing (for the workflow)

1. **Foundation** (serial, blocks all): migration `00031` + types + new
   `comm_type`/`membership_status` plumbing.
2. **Money core** (serial after 1): fix `createRefund` + pro-rata helper (shared
   dependency of B & C).
3. **Parallel build** (after 2): {refund+dispute webhooks} · {expiry cron +
   end-of-term modes + cancel action} · {comm templates + sends} · {admin
   plan-builder + membership dashboard} · {account order-history + saved
   addresses}.
4. **Adversarial review + integration** (per piece): money-safety, compliance
   (Rx retention/expiry untouched), IDOR/RLS, idempotency. Then full test gate.

## 12. Out of scope (explicit)

Recurring auto-billing; re-purchase renewal; multi-term rollover; user-initiated
pause/freeze; reuse-stored-Rx carry-forward; insurance/FSA-HSA; tax treatment;
membership price + Shopify product config (founder business steps).
