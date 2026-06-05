# Subscription + Account Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed via the **ultra multi-agent workflow** (founder's choice) — phases map to workflow stages.

**Goal:** Make the subscription engine money-safe and lifecycle-complete (refund/dispute webhooks, end-of-term + cancellation engine, admin plan/membership management) and close the two account gaps (one-time order history, saved addresses).

**Architecture:** One foundation migration (`00031`) adds enum values, membership lifecycle columns, a saved-addresses table, and a committed-slot guard trigger. A shared pro-rata refund helper + a fixed `createRefund` underpin all money movement. Webhooks (`refunds/create`, `disputes/create`) and a daily `membership-expiry` cron drive the membership state machine. Admin gets plan-builder + membership-management pages; customers get order history + saved addresses. All follows existing repo patterns (Server Actions with `isAdminRole`/`getCurrentCustomer` guards, `audit_log`, `communications` idempotency, `CRON_SECRET` timing-safe auth).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + RLS), Shopify Admin REST, Resend, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-05-subscription-account-completion-design.md`

---

## File Structure

**Created:**
- `supabase/migrations/00031_subscription_lifecycle.sql` — enums, membership cols, saved addresses, guard trigger
- `src/features/subscriptions/lib/refund-math.ts` — pure pro-rata calc
- `src/features/subscriptions/lib/end-of-term.ts` — expire/refund/rollover engine
- `src/features/subscriptions/webhooks/handle-refund.ts` — `refunds/create` handler
- `src/features/subscriptions/webhooks/handle-dispute.ts` — `disputes/create` handler
- `src/features/admin/memberships/actions/cancel-membership.ts` — admin pro-rata cancel
- `src/features/admin/plans/actions/save-plan.ts` — plan CRUD
- `src/app/api/cron/membership-expiry/route.ts` — lifecycle cron
- `src/lib/email/templates/{membership-welcome,slot-unlocked,pair-shipped,expiry-warning,renewal-offer}.ts`
- `src/features/account/addresses/actions/save-address.ts` — saved-address CRUD
- `src/app/(site)/account/addresses/page.tsx` + form
- `src/app/admin/plans/{page,new/page,[id]/page}.tsx`
- `src/app/admin/memberships/{page,[id]/page}.tsx`
- Test files mirror under `tests/...`

**Modified:**
- `src/lib/commerce/shopify-admin.ts` — fix `createRefund`, add `calculateRefund`
- `src/app/api/shopify/webhooks/route.ts` — route the two new topics
- `src/lib/supabase/types.ts` — new enums/columns/table types
- `src/features/subscriptions/provision-membership.ts` — send `membership_welcome` + `slot_unlocked`
- `src/features/.../create-shipment.ts` — send `pair_shipped` on subscription shipments
- `src/app/(site)/account/orders/page.tsx` — real one-time order history
- `src/app/(site)/account/subscription/redeem/[slotId]/...` — saved-address picker
- `vercel.json` — add the expiry cron schedule

---

## Phase 1 — Foundation (serial; blocks everything)

### Task 1.1: Migration 00031

**Files:**
- Create: `supabase/migrations/00031_subscription_lifecycle.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 00031_subscription_lifecycle.sql

-- 1. New communication types for the membership lifecycle
alter type comm_type add value if not exists 'membership_welcome';
alter type comm_type add value if not exists 'slot_unlocked';
alter type comm_type add value if not exists 'pair_shipped';
alter type comm_type add value if not exists 'expiry_warning';
alter type comm_type add value if not exists 'renewal_offer';

-- 2. Dispute state for memberships
alter type membership_status add value if not exists 'disputed';

-- 3. Lifecycle columns
alter table subscription_memberships
  add column if not exists grace_start timestamptz,
  add column if not exists renewal_offer_sent_at timestamptz,
  add column if not exists rollover_count int not null default 0,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

-- 4. Saved addresses
create table if not exists customer_saved_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  label text,
  recipient_name text not null,
  address jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_addr_customer on customer_saved_addresses(customer_id);
create unique index if not exists idx_saved_addr_one_default
  on customer_saved_addresses(customer_id) where is_default;

alter table customer_saved_addresses enable row level security;
create policy "addr_select_own" on customer_saved_addresses for select
  using (customer_id = current_customer_id());
create policy "addr_insert_own" on customer_saved_addresses for insert
  with check (customer_id = current_customer_id());
create policy "addr_update_own" on customer_saved_addresses for update
  using (customer_id = current_customer_id());
create policy "addr_delete_own" on customer_saved_addresses for delete
  using (customer_id = current_customer_id());

-- 5. Guard: a membership may not reach a terminal money state while any slot is committed
create or replace function guard_membership_terminal()
returns trigger language plpgsql as $$
begin
  if new.status in ('expired','refunded','cancelled') then
    if exists (
      select 1 from subscription_redemptions r
      where r.membership_id = new.id
        and r.status in ('pending_payment','awaiting_rx','in_review','in_production','shipped')
    ) then
      raise exception 'cannot set membership % to % while a slot is committed', new.id, new.status;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_membership_terminal on subscription_memberships;
create trigger trg_guard_membership_terminal
  before update of status on subscription_memberships
  for each row execute function guard_membership_terminal();
```

> Note: `alter type ... add value` cannot run inside a transaction with other DDL on PG < 12; on the project's Postgres (Supabase 15+) `add value if not exists` is transaction-safe. Keep the enum `alter`s at the top, committed before the table DDL uses them. If `db reset` errors on enum-in-transaction, split enum adds into `00031a` ahead of `00031b`.

- [ ] **Step 2: Apply and verify**

Run: `supabase db reset`
Expected: all 31 migrations apply with no error; `\d customer_saved_addresses` shows the table + RLS.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00031_subscription_lifecycle.sql
git commit -m "feat(subscription): 00031 lifecycle migration — comm types, membership cols, saved addresses, guard trigger"
```

### Task 1.2: Update hand-written types

**Files:**
- Modify: `src/lib/supabase/types.ts` (the hand-maintained types per launch checklist)

- [ ] **Step 1:** Add `'membership_welcome' | 'slot_unlocked' | 'pair_shipped' | 'expiry_warning' | 'renewal_offer'` to the `comm_type` union; add `'disputed'` to `membership_status`; add the new membership columns; add a `customer_saved_addresses` Row/Insert/Update type mirroring existing table typings.
- [ ] **Step 2:** Run `npx tsc --noEmit` → Expected: passes.
- [ ] **Step 3:** Commit: `chore(types): add 00031 enums/columns/table to types.ts`.

---

## Phase 2 — Money core (serial after Phase 1)

### Task 2.1: Pro-rata refund helper (pure, TDD)

**Files:**
- Create: `src/features/subscriptions/lib/refund-math.ts`
- Test: `tests/features/subscriptions/refund-math.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { computeProRataRefund } from '@/features/subscriptions/lib/refund-math';

describe('computeProRataRefund', () => {
  it('refunds the uncommitted fraction of captured amount', () => {
    // $150 captured, 3 pairs, 2 uncommitted -> 2/3 * 150 = 100.00
    expect(computeProRataRefund({ capturedAmount: 150, pairsTotal: 3, uncommittedCount: 2 })).toBe(100);
  });
  it('returns 0 when nothing is uncommitted', () => {
    expect(computeProRataRefund({ capturedAmount: 150, pairsTotal: 3, uncommittedCount: 0 })).toBe(0);
  });
  it('refunds full captured amount when all pairs uncommitted', () => {
    expect(computeProRataRefund({ capturedAmount: 150, pairsTotal: 3, uncommittedCount: 3 })).toBe(150);
  });
  it('rounds to 2 decimals (banker-safe down)', () => {
    // 100 / 3 * 1 = 33.333 -> 33.33
    expect(computeProRataRefund({ capturedAmount: 100, pairsTotal: 3, uncommittedCount: 1 })).toBe(33.33);
  });
  it('never exceeds captured and never negative', () => {
    expect(computeProRataRefund({ capturedAmount: 150, pairsTotal: 3, uncommittedCount: 5 })).toBe(150);
    expect(computeProRataRefund({ capturedAmount: 0, pairsTotal: 3, uncommittedCount: 2 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run tests/features/subscriptions/refund-math.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement**

```typescript
export interface ProRataInput {
  capturedAmount: number;   // actual amount captured by Shopify, this currency
  pairsTotal: number;       // frozen pairs_total on the membership
  uncommittedCount: number; // slots in {available, locked}
}

/** Pro-rata refund for unredeemed pairs. Floors at 0, caps at capturedAmount,
 *  rounds DOWN to cents so we never over-refund. */
export function computeProRataRefund({ capturedAmount, pairsTotal, uncommittedCount }: ProRataInput): number {
  if (capturedAmount <= 0 || pairsTotal <= 0 || uncommittedCount <= 0) return 0;
  const fraction = Math.min(uncommittedCount, pairsTotal) / pairsTotal;
  const raw = capturedAmount * fraction;
  const floored = Math.floor(raw * 100) / 100;
  return Math.min(floored, capturedAmount);
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(subscription): pro-rata refund math helper`.

### Task 2.2: Fix `createRefund` + add `calculateRefund` (TDD)

**Files:**
- Modify: `src/lib/commerce/shopify-admin.ts:100-117`
- Test: `tests/lib/commerce/refund.test.ts`

- [ ] **Step 1: Failing test** — mock `adminFetch`; assert `calculateRefund` is called first and `createRefund` posts the calculated `shipping` (not hardcoded `0.00`) and rejects when `amount > capturedAmount`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const adminFetch = vi.fn();
vi.mock('@/lib/commerce/admin-fetch', () => ({ adminFetch: (...a: unknown[]) => adminFetch(...a) }));
import { createRefund, calculateRefund } from '@/lib/commerce/shopify-admin';

beforeEach(() => adminFetch.mockReset());

it('calculates before refunding and uses returned shipping', async () => {
  adminFetch
    .mockResolvedValueOnce({ refund: { shipping: { amount: '5.00' }, transactions: [{ kind: 'suggested_refund', amount: '100.00', parent_id: 1, gateway: 'bogus' }] } }) // calculate
    .mockResolvedValueOnce({ refund: { id: 999 } }); // create
  await createRefund(123, 100, 'USD', 'cancel');
  const calcCall = adminFetch.mock.calls[0][0] as string;
  const createBody = adminFetch.mock.calls[1][1] as { body: { refund: { shipping: { amount: string } } } };
  expect(calcCall).toContain('refunds/calculate.json');
  expect(createBody.body.refund.shipping.amount).toBe('5.00');
});

it('throws if requested amount exceeds captured/suggested', async () => {
  adminFetch.mockResolvedValueOnce({ refund: { shipping: { amount: '0.00' }, transactions: [{ kind: 'suggested_refund', amount: '50.00' }] } });
  await expect(createRefund(123, 100, 'USD', 'cancel')).rejects.toThrow(/exceeds/);
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — note: `adminFetch` may need extracting to its own module `src/lib/commerce/admin-fetch.ts` if not already importable; if it already lives in `shopify-admin.ts`, mock it via `vi.spyOn` instead and adjust the test import accordingly.

```typescript
export async function calculateRefund(orderId: number, amount: number, currency: string) {
  return adminFetch(`orders/${orderId}/refunds/calculate.json`, {
    method: 'POST',
    body: { refund: { currency, shipping: { full_refund: false }, transactions: [{ kind: 'refund' }] } },
  }) as Promise<{ refund: { shipping?: { amount: string }; transactions: Array<{ kind: string; amount: string; parent_id?: number; gateway?: string }> } }>;
}

export async function createRefund(orderId: number, amount: number, currency: string, note: string) {
  const calc = await calculateRefund(orderId, amount, currency);
  const suggested = calc.refund.transactions.find(t => t.kind === 'suggested_refund') ?? calc.refund.transactions[0];
  const suggestedAmount = suggested ? parseFloat(suggested.amount) : Infinity;
  if (amount > suggestedAmount + 0.001) {
    throw new Error(`refund amount ${amount} exceeds refundable ${suggestedAmount} for order ${orderId}`);
  }
  return adminFetch(`orders/${orderId}/refunds.json`, {
    method: 'POST',
    body: {
      refund: {
        currency,
        note,
        shipping: calc.refund.shipping ?? { amount: '0.00' },
        transactions: [{
          kind: 'refund',
          amount: amount.toFixed(2),
          parent_id: suggested?.parent_id,
          gateway: suggested?.gateway,
        }],
      },
    },
  });
}
```

- [ ] **Step 4: Verify pass.** Confirm existing `createRefund` callers (returns flow) still typecheck.
- [ ] **Step 5: Commit** `fix(commerce): calculate-then-refund, stop hardcoding shipping=0 (over-refund bug)`.

---

## Phase 3 — Refund/dispute webhooks (after Phase 2)

### Task 3.1: `refunds/create` handler (TDD)

**Files:**
- Create: `src/features/subscriptions/webhooks/handle-refund.ts`
- Modify: `src/app/api/shopify/webhooks/route.ts`
- Test: `tests/features/subscriptions/handle-refund.test.ts`

- [ ] **Step 1: Failing test.** Given a refund on a membership order id → membership `refunded`, uncommitted slots `expired`, committed slots untouched, idempotent on re-delivery, no-op when order id matches no membership/add-on.

```typescript
// handleRefundWebhook(payload, supabase) -> { handled: 'membership'|'addon'|'none', expiredSlots: number }
it('membership refund expires uncommitted slots and marks membership refunded', async () => { /* mock supabase chain */ });
it('add-on refund reverts that redemption to available + releases inventory', async () => {});
it('committed slots are left running to completion', async () => {});
it('is a no-op for unrelated orders', async () => {});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** `handleRefundWebhook(payload, supabase)`:
  - Read `payload.order_id`.
  - If it matches `subscription_memberships.shopify_order_id` → update uncommitted (`available`,`locked`) redemptions → `expired`; set membership → `refunded` (trigger enforces no committed slots; if the trigger raises, catch → leave membership `active`, log, and let admin handle). Return `{handled:'membership'}`.
  - Else if it matches `subscription_redemptions.add_on_shopify_order_id` → reuse the sweep-abandoned revert (status→`available`, clear lens_config/ship_to, +1 inventory release). Return `{handled:'addon'}`.
  - Else `{handled:'none'}`.
- [ ] **Step 4:** Wire into `webhooks/route.ts`: add `case 'refunds/create':` after the existing cases, inside the same HMAC + `webhook_events` idempotency block; call `handleRefundWebhook`.
- [ ] **Step 5: Verify pass.** Commit `feat(subscription): refunds/create webhook expires slots on Shopify-side refund`.

### Task 3.2: `disputes/create` handler (TDD)

**Files:**
- Create: `src/features/subscriptions/webhooks/handle-dispute.ts`
- Modify: `src/app/api/shopify/webhooks/route.ts`
- Test: `tests/features/subscriptions/handle-dispute.test.ts`

- [ ] **Step 1: Failing test.** Dispute on a membership order → membership `disputed` (blocks new redemptions); idempotent; no-op otherwise. (`startRedemption` must reject when membership not in {active}; add a test there too that `disputed` blocks redemption.)
- [ ] **Step 2-4:** Implement `handleDisputeWebhook(payload, supabase)` setting membership `status='disputed'` and writing an `audit_log` entry flagging manual review; wire `case 'disputes/create':` in the route. Confirm `startRedemption`'s active-membership gate already excludes `disputed` (it checks `status='active'`); add an explicit test.
- [ ] **Step 5: Commit** `feat(subscription): disputes/create freezes membership pending manual review`.

---

## Phase 4 — Lifecycle engine (after Phase 2; parallel with Phase 5)

### Task 4.1: End-of-term engine (TDD)

**Files:**
- Create: `src/features/subscriptions/lib/end-of-term.ts`
- Test: `tests/features/subscriptions/end-of-term.test.ts`

- [ ] **Step 1: Failing test** for `applyEndOfTerm({ membership, redemptions, deps })` covering all three modes:
  - `expire` → uncommitted slots `expired`, membership `expired`, returns `{ mode:'expire', expired:n }`, no refund call.
  - `refund` → calls `deps.createRefund` with `computeProRataRefund(...)`, slots `expired`, membership `refunded`.
  - `rollover` (rollover_count 0) → `term_end += term_months`, `rollover_count=1`, membership stays `active`, slots stay `available`.
  - `rollover` (rollover_count 1) → falls back to the plan's *secondary* behaviour = `expire` (no infinite extension).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** pure-ish orchestrator taking injected `deps` (`createRefund`, a `now` clock, supabase updater) so it's unit-testable; the cron supplies real deps. Use `computeProRataRefund` and the membership's frozen `pairs_total`/`captured` (captured fetched via Shopify in the cron, passed in).
- [ ] **Step 4: Verify pass.** **Step 5: Commit** `feat(subscription): end-of-term engine (expire/refund/rollover)`.

### Task 4.2: `membership-expiry` cron (TDD + schedule)

**Files:**
- Create: `src/app/api/cron/membership-expiry/route.ts`
- Modify: `vercel.json`
- Test: `tests/app/cron/membership-expiry.test.ts`

- [ ] **Step 1: Failing test.** Mock supabase + Shopify + `sendEmail`. Assert: unauthorized without `CRON_SECRET`; `expiry_warning` sent once per (membership, reminder-day) using the `communications` idempotency index; `active → grace` at `term_end`; `applyEndOfTerm` invoked at `term_end + grace_days`; committed-slot memberships are skipped (guard).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** GET route reusing the shared `authorize()` timing-safe `CRON_SECRET` check (copy the pattern from `sweep-redemptions`), the reminder pre-claim pattern from `rx-reminder`, and `applyEndOfTerm` from 4.1. Pull captured amount from Shopify for refund mode.
- [ ] **Step 4: Add schedule** to `vercel.json`: `{ "path": "/api/cron/membership-expiry", "schedule": "0 6 * * *" }`.
- [ ] **Step 5: Verify pass. Commit** `feat(subscription): membership-expiry cron — reminders, grace, end-of-term`.

### Task 4.3: Admin `cancelMembership` (TDD)

**Files:**
- Create: `src/features/admin/memberships/actions/cancel-membership.ts`
- Test: `tests/features/admin/cancel-membership.test.ts`

- [ ] **Step 1: Failing test.** Non-admin rejected; admin path computes pro-rata, calls `createRefund`, expires uncommitted slots, sets membership `cancelled` + `cancelled_at`/`cancel_reason`, writes `audit_log`; idempotent (no-op if not in {active,grace}); committed slots block via trigger → surfaced as error.
- [ ] **Step 2-4:** Implement mirroring `reviewRx` (auth guard `getCurrentUser` + `isAdminRole`, `audit_log` write). Reuse `computeProRataRefund` + fixed `createRefund`. Captured amount fetched from Shopify by membership `shopify_order_id`.
- [ ] **Step 5: Commit** `feat(admin): cancel membership with pro-rata refund`.

---

## Phase 5 — Communications (parallel with Phase 4)

### Task 5.1: Email templates

**Files:**
- Create: `src/lib/email/templates/{membership-welcome,slot-unlocked,pair-shipped,expiry-warning,renewal-offer}.ts`
- Test: `tests/lib/email/membership-templates.test.ts`

- [ ] **Step 1: Failing tests** — each `render*` returns `{subject, html, text}`, subject non-empty, html contains the key dynamic field (member name / slot link / tracking link / days-left / renewal CTA), and text has no unrendered `${}`. Mirror `renderRxReminder` shape.
- [ ] **Step 2-4:** Implement five renderers following `rx-reminder.ts` conventions (no PII logged; links built from `NEXT_PUBLIC_APP_URL`).
- [ ] **Step 5: Commit** `feat(email): membership lifecycle templates`.

### Task 5.2: Wire sends into lifecycle points

**Files:**
- Modify: `src/features/subscriptions/provision-membership.ts` (send `membership_welcome`; `slot_unlocked` for immediately-available slots)
- Modify: the shipment creator that finalizes a shipment (send `pair_shipped` for subscription redemptions — find via `advanceRedemptionForOrder` call site / `create-shipment`)
- (`expiry_warning`/`renewal_offer` already wired by Task 4.2)
- Test: extend `tests/features/subscriptions/provision-membership.test.ts`

- [ ] **Step 1: Failing test** — provisioning sends exactly one `membership_welcome` (idempotent on re-delivery via `communications` index); shipment of a subscription pair sends one `pair_shipped`.
- [ ] **Step 2-4:** Add `sendEmail` calls guarded by the `communications` idempotency insert (same pattern as `rx-reminder`). Non-subscription shipments unaffected.
- [ ] **Step 5: Commit** `feat(subscription): send welcome/slot-unlocked/pair-shipped emails`.

---

## Phase 6 — Admin UI (after Phase 4)

### Task 6.1: Plan-builder

**Files:**
- Create: `src/features/admin/plans/actions/save-plan.ts` (createPlan/updatePlan)
- Create: `src/app/admin/plans/page.tsx`, `src/app/admin/plans/new/page.tsx`, `src/app/admin/plans/[id]/page.tsx`
- Test: `tests/features/admin/save-plan.test.ts`

- [ ] **Step 1: Failing test** for `savePlan` — non-admin rejected; validates `pairs_count>0`, `term_months>0`, `end_of_term_policy.mode ∈ {expire,refund,rollover}`; inserts/updates `subscription_plans`; **rejects editing terms of a plan that has live memberships** (guard: terms are frozen per-membership, but block silent template drift — instead allow status/markets/shopify-id edits, block pairs_count/term_months edits when memberships exist); writes `audit_log`.
- [ ] **Step 2-4:** Implement action + pages following the admin pattern (force-dynamic layout guard already covers `/admin/*`; service-role fetch; form posts to action). List shows all plans; new/edit forms expose name, pairs_count, term_months, redemption_policy.mode, end_of_term_policy (mode + reminder_days + grace_days), markets, status, shopify product/variant ids.
- [ ] **Step 5: Commit** `feat(admin): subscription plan-builder (multi-plan CRUD)`.

### Task 6.2: Membership dashboard

**Files:**
- Create: `src/app/admin/memberships/page.tsx`, `src/app/admin/memberships/[id]/page.tsx`
- Create: `src/features/admin/memberships/actions/admin-membership-ops.ts` (manual expire, freeze/unfreeze, resend email — cancel reuses Task 4.3)
- Test: `tests/features/admin/admin-membership-ops.test.ts`

- [ ] **Step 1: Failing test** — list filters by status/expiring-soon; detail loads slots; manual `expire`/`freeze`/`unfreeze` auth-guarded + audit-logged + trigger-safe.
- [ ] **Step 2-4:** Implement following admin pattern; detail page renders frozen terms, term countdown, every slot + status, linked orders, and action buttons (Cancel+Refund → 4.3; Expire; Freeze/Unfreeze; Resend lifecycle email).
- [ ] **Step 5: Commit** `feat(admin): membership management dashboard`.

---

## Phase 7 — Account (parallel; needs Phase 1 only)

### Task 7.1: Saved addresses

**Files:**
- Create: `src/features/account/addresses/actions/save-address.ts` (add/update/delete/setDefault)
- Create: `src/app/(site)/account/addresses/page.tsx` + a client form component
- Test: `tests/features/account/save-address.test.ts`

- [ ] **Step 1: Failing test** — actions require `getCurrentCustomer()`; RLS scopes rows to the customer; setting a new default unsets the old (partial unique index); cannot read/write another customer's address.
- [ ] **Step 2-4:** Implement CRUD via the user-scoped Supabase client (RLS enforced) and the page following `/account/*` conventions.
- [ ] **Step 5: Commit** `feat(account): saved addresses`.

### Task 7.2: Redeem-flow address picker

**Files:**
- Modify: `src/app/(site)/account/subscription/redeem/[slotId]/...` (the redeem form)
- Test: extend redeem-flow component/integration test

- [ ] **Step 1: Failing test** — saved addresses render as selectable options; choosing one prefills `ship_to`; manual entry still works; `startRedemption` receives the chosen `ship_to` unchanged.
- [ ] **Step 2-4:** Add the picker; no change to `startRedemption` signature.
- [ ] **Step 5: Commit** `feat(account): use saved address when redeeming`.

### Task 7.3: One-time order history

**Files:**
- Modify: `src/app/(site)/account/orders/page.tsx`
- Test: `tests/features/account/order-history.test.ts`

- [ ] **Step 1: Failing test** — lists only the authenticated customer's `order_source != 'subscription'` orders; never leaks another customer's orders; empty state when none. (Verify exact customer↔order linkage column in `orders` during impl — `customer_id` or email join from `00027`.)
- [ ] **Step 2-4:** Implement the real list (order number, date, status, items, tracking link to `/track/[orderId]`).
- [ ] **Step 5: Commit** `feat(account): one-time order history`.

---

## Phase 8 — Integration gate (final)

- [ ] `supabase db reset` clean (31 migrations).
- [ ] `npx vitest run` — all unit tests green.
- [ ] `npx tsc --noEmit` + `npm run lint` clean.
- [ ] `npx playwright test` for the new e2e: admin cancel→refund+expire; account add-address→redeem-with-it; cron drives a membership to `refunded`.
- [ ] Dispatch a `feature-dev:code-reviewer` (fresh context) over the full diff — focus: money-safety (no over-refund, captured-from-Shopify), compliance untouched (Rx retention/expiry, ship-gate), IDOR/RLS on new customer+admin surfaces, webhook idempotency. Fix findings.

---

## Self-Review

**Spec coverage:** A (3.1→T2.2, 3.2→T3.1, 3.3→T3.2) · B (4.2→T4.2, 4.3→T4.1, 4.4→T2.1, 4.5→T4.3) · C (5.1→T6.1, 5.2→T6.2) · D (6.1→T7.1+7.2, 6.2→T7.3) · migration 00031→T1.1 · comms §8→T5.1/5.2 · state machines §9→T3.2/T4.x · testing §10→tests throughout + T8. All spec sections mapped.

**Placeholder scan:** Concrete code given for all money/state logic (refund math, createRefund, end-of-term, guard trigger). UI tasks (6.x, 7.x) intentionally reference the established admin/account patterns rather than re-printing boilerplate — acceptable since those patterns are documented in the spec's reference map and are pattern-following, not novel logic.

**Type consistency:** `computeProRataRefund(ProRataInput)`, `createRefund(orderId, amount, currency, note)`, `calculateRefund(orderId, amount, currency)`, `applyEndOfTerm({membership, redemptions, deps})`, `handleRefundWebhook(payload, supabase)`, `handleDisputeWebhook(payload, supabase)`, `cancelMembership(...)`, `savePlan(...)` — names consistent across tasks.

**Known verification points (resolve during impl, not blockers):** exact `adminFetch` import path for mocking (T2.2); exact orders↔customer linkage column (T7.3); enum-in-transaction behavior on `db reset` (T1.1 note).
