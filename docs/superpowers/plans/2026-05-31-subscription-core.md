# Subscription Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell a prepaid annual subscription (1 seeded plan, 3 pairs/12 months, all-immediate) and fulfill each pair — covered or paid-upgrade — through the existing Rx→review→lab→ship pipeline via a synthesized internal order.

**Architecture:** Approach A (Shopify owns money; Supabase owns entitlements). Membership = a Shopify product; provisioning is idempotent + paid-gated on the order webhook. Each redemption claims a pre-materialized slot atomically, optionally takes a second Shopify checkout for surcharges (amount-verified), then creates a synthesized `orders`+`order_line_items` row (`order_source='subscription'`, null Shopify ids — Keystone 1) that flows through the unchanged fulfillment pipeline.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + RLS), Vitest, Shopify Storefront/Admin APIs.

**Reference patterns:** webhook switch + idempotency = `src/app/api/shopify/webhooks/route.ts`; order sync + line-item property extraction = `src/lib/commerce/sync.ts`; `createCart` = `src/lib/commerce/shopify.ts`; cron auth = `src/app/api/cron/rx-reminder/route.ts`; work-order gen = `src/features/admin/actions/generate-work-order.ts`; ship gate = `src/features/lab/actions/create-shipment.ts`; customer auth = `src/lib/auth/customer.ts` (`getCurrentCustomer`); RLS helper = `current_customer_id()` (migration 00027).

**Spec:** `docs/superpowers/specs/2026-05-31-subscription-core-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/00028_subscription_core.sql` — Keystone-1 alters, new tables, seed plan, RLS.
- `src/features/subscriptions/provision-membership.ts` — `provisionMembershipFromOrder`.
- `src/features/subscriptions/redemption-order.ts` — `createRedemptionFulfillmentOrder` (synthesized order).
- `src/features/subscriptions/actions/start-redemption.ts` — `startRedemption` (claim + reserve + surcharge fork).
- `src/features/subscriptions/confirm-addon-payment.ts` — `confirmAddonPayment` (webhook-side match + amount verify).
- `src/features/subscriptions/sweep-abandoned.ts` — `sweepAbandonedRedemptions`.
- `src/features/subscriptions/advance-redemption.ts` — status mirroring helpers.
- `src/app/api/cron/sweep-redemptions/route.ts` — sweeper cron endpoint.
- `src/app/(site)/account/subscription/page.tsx` — dashboard.
- `src/app/(site)/account/subscription/redeem/[slotId]/page.tsx` — redemption screen.
- Tests under `tests/features/subscriptions/`, `tests/api/...`.

**Modify:**
- `src/app/api/shopify/webhooks/route.ts` — add `orders/paid`; call provisioning + add-on confirmation.
- `src/lib/commerce/sync.ts` — capture `redemption_id` line-item property.
- `src/features/admin/actions/generate-work-order.ts` + `src/features/lab/actions/create-shipment.ts` — advance linked redemption status + set `retention_anchor`.
- `src/app/(site)/account/page.tsx` — link the subscription dashboard (replace placeholder card).
- `src/lib/supabase/types.ts` — regenerate / hand-add new tables + columns.

---

## Task 1: Migration — Keystone-1 alters + subscription tables + seed

**Files:** Create `supabase/migrations/00028_subscription_core.sql`; modify `src/lib/supabase/types.ts`.

- [ ] **Step 1: Write the migration**

```sql
-- Keystone 1: let a redemption synthesize an internal order with no Shopify ids.
alter table orders alter column shopify_order_id drop not null;
drop index if exists idx_orders_shopify_id;
-- (the column-level UNIQUE came from the table def; replace with a partial unique)
alter table orders drop constraint if exists orders_shopify_order_id_key;
create unique index orders_shopify_order_id_key on orders(shopify_order_id) where shopify_order_id is not null;
create index idx_orders_shopify_id on orders(shopify_order_id);
create type order_source as enum ('shopify', 'subscription');
alter table orders add column order_source order_source not null default 'shopify';

alter table order_line_items alter column shopify_line_item_id drop not null;

-- Per-item subscription coverage config.
alter table product_metadata add column subscription_tier text not null default 'included'
  check (subscription_tier in ('included', 'premium', 'excluded'));
alter table product_metadata add column subscription_surcharge_variant_id bigint;

-- System (customer-driven) inventory reservations have no staff user.
alter table inventory_adjustments alter column user_id drop not null;
alter type adjustment_reason add value if not exists 'subscription_reserved';
alter type adjustment_reason add value if not exists 'subscription_release';

-- Plans (seeded; admin builder UI is deferred).
create table subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pairs_count int not null default 3,
  term_months int not null default 12,
  billing_mode text not null default 'prepaid' check (billing_mode in ('prepaid', 'recurring')),
  redemption_policy jsonb not null default '{"mode":"all_immediate"}'::jsonb,
  end_of_term_policy jsonb not null default '{"mode":"expire","reminder_days":[60,30,7],"grace_days":14}'::jsonb,
  shopify_product_id bigint,
  shopify_variant_id bigint,
  status text not null default 'active' check (status in ('active','draft','archived')),
  created_at timestamptz not null default now()
);

create type membership_status as enum ('active','grace','expired','cancelled','refunded','frozen');
create table subscription_memberships (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references subscription_plans(id),
  customer_id uuid references customers(id),
  shopify_order_id bigint unique not null,
  status membership_status not null default 'active',
  term_start timestamptz not null default now(),
  term_end timestamptz not null,
  pairs_total int not null,
  redemption_policy jsonb not null,
  end_of_term_policy jsonb not null,
  next_renewal_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index idx_one_active_membership_per_customer
  on subscription_memberships(customer_id)
  where status in ('active','grace');

create type redemption_status as enum (
  'available','locked','pending_payment','awaiting_rx','in_review','in_production','shipped','delivered','cancelled','expired','rx_rejected'
);
create table subscription_redemptions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references subscription_memberships(id),
  slot_index int not null,
  status redemption_status not null default 'available',
  unlocks_at timestamptz not null default now(),
  frame_variant_id bigint,
  is_premium boolean not null default false,
  lens_config jsonb not null default '{}'::jsonb,
  ship_to jsonb,
  expected_surcharge numeric(10,2) not null default 0,
  add_on_shopify_order_id bigint,
  internal_order_id uuid references orders(id),
  internal_line_item_id uuid references order_line_items(id),
  rx_file_id uuid references rx_files(id),
  rx_review_id uuid references rx_reviews(id),
  work_order_id uuid references work_orders(id),
  retention_anchor date,
  pending_payment_expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (membership_id, slot_index)
);
create index idx_redemptions_membership on subscription_redemptions(membership_id);
create index idx_redemptions_pending on subscription_redemptions(pending_payment_expires_at) where status = 'pending_payment';

create table subscription_addon_options (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  shopify_variant_id bigint,
  price numeric(10,2) not null default 0,
  lens_effect jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

-- RLS: customers read only their own membership + redemptions.
alter table subscription_memberships enable row level security;
alter table subscription_redemptions enable row level security;
create policy "Customer reads own memberships" on subscription_memberships
  for select using (customer_id = public.current_customer_id());
create policy "Customer reads own redemptions" on subscription_redemptions
  for select using (membership_id in (
    select id from subscription_memberships where customer_id = public.current_customer_id()
  ));

-- Seed the single phase-1 plan. shopify_product_id is set post-deploy from
-- SUBSCRIPTION_MEMBERSHIP_PRODUCT_ID once the Shopify product exists.
insert into subscription_plans (name, pairs_count, term_months, redemption_policy, end_of_term_policy, status)
values ('GlassyVision Annual — 3 Pairs', 3, 12,
        '{"mode":"all_immediate"}'::jsonb,
        '{"mode":"expire","reminder_days":[60,30,7],"grace_days":14}'::jsonb,
        'active');

-- Seed starter lens add-on options (variant ids set post-deploy).
insert into subscription_addon_options (key, label, price, lens_effect) values
  ('progressive', 'Progressive lenses', 0, '{"lens_type":"progressive"}'::jsonb),
  ('blue_light', 'Blue-light filter', 0, '{"coating":"blue_light"}'::jsonb),
  ('anti_glare', 'Anti-glare coating', 0, '{"coating":"anti_glare"}'::jsonb),
  ('high_index', 'High-index (thin) lenses', 0, '{"lens_material":"high_index_1_67"}'::jsonb),
  ('photochromic', 'Photochromic / polarized', 0, '{"coating":"photochromic"}'::jsonb);
```

> **Note for implementer:** `alter type ... add value` cannot run inside a transaction with later use of the value in some Postgres versions; if `supabase db reset` errors on that, split the two `add value` statements into their own migration file `00028a_*.sql` ordered before this one. Verify with `supabase db reset`.

- [ ] **Step 2: Apply + regenerate types**

Run: `supabase db reset` (expect clean through 00028). Then add the new tables/columns/enums to `src/lib/supabase/types.ts` — either via `supabase gen types typescript --local` (then keep only the additions if the repo prefers the hand-maintained file) or by hand-adding the `subscription_plans`/`subscription_memberships`/`subscription_redemptions`/`subscription_addon_options` Row/Insert/Update blocks, the new `order_source`/`subscription_tier`/`subscription_surcharge_variant_id` columns, and the new enums. Verify `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00028_subscription_core.sql src/lib/supabase/types.ts
git commit -m "feat(subscription): Keystone-1 alters + plans/memberships/redemptions tables + seed"
```

---

## Task 2: Membership provisioning

**Files:** Create `src/features/subscriptions/provision-membership.ts`; modify `src/app/api/shopify/webhooks/route.ts`; Test `tests/features/subscriptions/provision-membership.test.ts`.

- [ ] **Step 1: Write the failing test** (idempotent, paid-gated, pre-materializes slots)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const supabase = { from };
function table(impl: Record<string, unknown>) { return impl; }

beforeEach(() => { from.mockReset(); });

describe('provisionMembershipFromOrder', () => {
  it('does nothing when no line item matches an active plan product', async () => {
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 999, product_id: 999 }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'plan-1', shopify_product_id: 111, shopify_variant_id: 222, pairs_count: 3, term_months: 12, redemption_policy: {mode:'all_immediate'}, end_of_term_policy: {} }], error: null }) }) };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(false);
  });

  it('provisions a membership + N slots when paid and product matches', async () => {
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'mem-1' }, error: null }) }) }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 222, product_id: 111 }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'plan-1', shopify_product_id: 111, shopify_variant_id: 222, pairs_count: 3, term_months: 12, redemption_policy: {mode:'all_immediate'}, end_of_term_policy: {} }], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(true);
    expect(slotInsert).toHaveBeenCalledTimes(1); // bulk insert of 3 rows
  });

  it('does NOT provision when not paid', async () => {
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', financial_status: 'pending' } as never, supabase as never);
    expect(res.provisioned).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run tests/features/subscriptions/provision-membership.test.ts`

- [ ] **Step 3: Implement** `src/features/subscriptions/provision-membership.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

interface OrderRow {
  id: string; shopify_order_id: number; customer_id: string | null;
  customer_email?: string; currency?: string; financial_status: string;
}

export async function provisionMembershipFromOrder(
  order: OrderRow,
  supabase: SupabaseClient,
): Promise<{ provisioned: boolean; membershipId?: string }> {
  if (order.financial_status !== 'paid') return { provisioned: false };

  const { data: lineItems } = await supabase
    .from('order_line_items').select('variant_id, product_id').eq('order_id', order.id);
  const { data: plans } = await supabase
    .from('subscription_plans').select('*').eq('status', 'active');

  const plan = (plans ?? []).find((p) =>
    (lineItems ?? []).some((li) =>
      (p.shopify_variant_id && li.variant_id === p.shopify_variant_id) ||
      (p.shopify_product_id && li.product_id === p.shopify_product_id)));
  if (!plan) return { provisioned: false };

  const termEnd = new Date();
  termEnd.setMonth(termEnd.getMonth() + plan.term_months);

  // Idempotent on shopify_order_id (unique). ON CONFLICT DO NOTHING → null on dup.
  const { data: membership } = await supabase
    .from('subscription_memberships')
    .insert({
      plan_id: plan.id, customer_id: order.customer_id, shopify_order_id: order.shopify_order_id,
      status: 'active', term_end: termEnd.toISOString(), pairs_total: plan.pairs_count,
      redemption_policy: plan.redemption_policy, end_of_term_policy: plan.end_of_term_policy,
    })
    .select('id').maybeSingle();

  if (!membership) return { provisioned: false }; // already provisioned (conflict)

  const allImmediate = (plan.redemption_policy?.mode ?? 'all_immediate') === 'all_immediate';
  const slots = Array.from({ length: plan.pairs_count }, (_, i) => ({
    membership_id: membership.id, slot_index: i, status: 'available' as const,
    unlocks_at: allImmediate ? new Date().toISOString() : new Date().toISOString(),
  }));
  await supabase.from('subscription_redemptions').insert(slots);

  return { provisioned: true, membershipId: membership.id };
}
```

> **Note:** `.insert(...).select().maybeSingle()` returns null on an `ON CONFLICT DO NOTHING` no-op. Confirm the Supabase client surfaces a unique-violation as either `error.code==='23505'` or a null row; handle both (treat as "already provisioned → not provisioned again"). Adjust the impl to catch `23505` and return `{provisioned:false}` if `.select()` throws instead of returning null.

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Wire into the webhook.** In `src/app/api/shopify/webhooks/route.ts`, add `'orders/paid'` alongside `'orders/create'`/`'orders/updated'` so the same `syncShopifyOrder` runs, and after a successful sync call provisioning. Import `provisionMembershipFromOrder`. After `syncShopifyOrder` succeeds, fetch the synced order row (`select * from orders where shopify_order_id = payload.id`) and call `await provisionMembershipFromOrder(orderRow, supabase)`. (Provisioning is internally paid-gated + idempotent.)

- [ ] **Step 6: Run the existing webhook test** (`tests/api/shopify/webhooks/route.test.ts`) → still passes. Commit.

```bash
git add src/features/subscriptions/provision-membership.ts src/app/api/shopify/webhooks/route.ts tests/features/subscriptions/provision-membership.test.ts
git commit -m "feat(subscription): idempotent paid-gated membership provisioning on order webhook"
```

---

## Task 3: Synthesized fulfillment order (Keystone 1)

**Files:** Create `src/features/subscriptions/redemption-order.ts`; Test `tests/features/subscriptions/redemption-order.test.ts`.

- [ ] **Step 1: Failing test** — creates an `orders` row (`order_source='subscription'`, null `shopify_order_id`) + an `order_line_items` row (null `shopify_line_item_id`) from a redemption + frame metadata, returns both ids.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
const from = vi.fn();
beforeEach(() => from.mockReset());
describe('createRedemptionFulfillmentOrder', () => {
  it('creates a subscription-source order + line item with frame spec', async () => {
    const orderInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'ord-1' }, error: null }) }) }));
    const liInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'li-1' }, error: null }) }) }));
    from.mockImplementation((t: string) => {
      if (t === 'product_metadata') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { sku: 'GV-1', frame_shape: 'round', is_rx_capable: true }, error: null }) }) }) };
      if (t === 'orders') return { insert: orderInsert };
      if (t === 'order_line_items') return { insert: liInsert };
      return {};
    });
    const { createRedemptionFulfillmentOrder } = await import('@/features/subscriptions/redemption-order');
    const res = await createRedemptionFulfillmentOrder({
      id: 'r1', frame_variant_id: 222, lens_config: {}, ship_to: { country_code: 'US' },
      membership: { customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd' },
    } as never, { from } as never);
    expect(res).toEqual({ orderId: 'ord-1', lineItemId: 'li-1' });
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({ order_source: 'subscription', shopify_order_id: null, billing_country: 'us' }));
    expect(liInsert).toHaveBeenCalledWith(expect.objectContaining({ order_id: 'ord-1', shopify_line_item_id: null, sku: 'GV-1' }));
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** `createRedemptionFulfillmentOrder(redemption, supabase)`:
  - Look up `product_metadata` by `frame_variant_id` for sku/shape/color/size + `is_rx_capable`.
  - Insert `orders`: `order_source:'subscription'`, `shopify_order_id:null`, `shopify_order_number: 'SUB-' + redemption.id.slice(0,8)`, `customer_id`, `customer_email`, `shipping_address: ship_to`, `billing_country: ship_to.country_code.toLowerCase()`, `currency`, `subtotal/total:0`, `has_rx_items: is_rx_capable && wantsRx`, `rx_status: has_rx_items ? 'awaiting_upload' : 'none'`. Return its id.
  - Insert `order_line_items`: `order_id`, `shopify_line_item_id:null`, `product_title`, `sku`, `quantity:1`, `unit_price:0`, `line_total:0`, `is_rx_required: has_rx_items`, frame_shape/color/size. Return its id.
  - Return `{ orderId, lineItemId }`.

> **Note:** `billing_country` CHECK only allows `us`/`ca`. The destination market gate (sub-project 0.5) rejects non-US/CA ship-to BEFORE this — so `startRedemption` must validate `ship_to.country_code ∈ {US,CA}` and refuse otherwise (Rx pairs) rather than letting the insert fail. Plain sunglasses to other markets are out of phase-1 scope; refuse non-US/CA for now.

- [ ] **Step 4: Run → pass. Commit.**

```bash
git add src/features/subscriptions/redemption-order.ts tests/features/subscriptions/redemption-order.test.ts
git commit -m "feat(subscription): synthesized fulfillment order per redemption (Keystone 1)"
```

---

## Task 4: startRedemption (claim + reserve + surcharge fork)

**Files:** Create `src/features/subscriptions/actions/start-redemption.ts`; Test `tests/features/subscriptions/start-redemption.test.ts`.

- [ ] **Step 1: Failing tests** covering: (a) rejects when the slot isn't the caller's; (b) atomic claim returns error when slot not `available`; (c) $0 covered path → creates synthesized order, status `awaiting_rx`, no cart; (d) `>0` path → `pending_payment` + returns `checkoutUrl`; (e) out-of-stock → releases lock + error.

```typescript
// Mock getCurrentCustomer, createAdminClient, createCart, createRedemptionFulfillmentOrder.
// Assert the conditional update is called with .eq('status','available'); assert
// surcharge math; assert pending_payment vs awaiting_rx branch.
```
(Write concrete cases mirroring the claim-account test style: mock the `update().eq().eq().lte().select()` chain to return `[{id}]` or `[]`.)

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `startRedemption({ slotId, frameVariantId, lensConfig, shipTo })` (NOT a `'use server'` action if only called from a server component; if called from a client redemption form, keep `'use server'` and rely on the `getCurrentCustomer` gate). Logic:
  1. `const customer = await getCurrentCustomer(); if (!customer) return { error:'unauthorized' }`.
  2. Validate `shipTo.country_code ∈ {US,CA}` (Rx market gate); else `{ error:'We can only ship prescription eyewear to the US and Canada right now.' }`.
  3. Load the slot + its membership; verify `membership.customer_id === customer.id` and `membership.status==='active'`; else error.
  4. Compute surcharge: premium frame (`product_metadata.subscription_tier==='premium'` → its `subscription_surcharge_variant_id` + price) + selected `subscription_addon_options` prices. `expected = Σ`.
  5. **Atomic claim:** `update subscription_redemptions set status='locked', frame_variant_id, lens_config, ship_to, expected_surcharge, is_premium where id=$slot and status='available' and unlocks_at<=now() returning id`. Zero rows → `{ error:'This pair is not available.' }`.
  6. **Reserve inventory:** find `inventory_pool` by `frame_variant_id`; if `pool_quantity<=0` → revert slot to `available` + `{ error:'out of stock' }`; else insert `inventory_adjustments` (`delta:-1, reason:'subscription_reserved', user_id:null`) and decrement `pool_quantity`.
  7. **Fork:** if `expected===0` → `createRedemptionFulfillmentOrder` → set redemption `internal_order_id/line_item_id`, `status: has_rx ? 'awaiting_rx' : 'in_production'` (non-Rx straight to lab via Task 7), `redeemed_at=now` → return `{ ok:true }`. Else → set `status='pending_payment'`, `pending_payment_expires_at=now+60min`; build `createCart` lines from surcharge variant ids with `attributes:[{key:'redemption_id', value:slotId}]`; return `{ ok:true, checkoutUrl }`.

- [ ] **Step 4: Run → pass. Commit.**

```bash
git add src/features/subscriptions/actions/start-redemption.ts tests/features/subscriptions/start-redemption.test.ts
git commit -m "feat(subscription): startRedemption — atomic claim, inventory reserve, surcharge fork"
```

---

## Task 5: Add-on payment confirmation (webhook)

**Files:** Create `src/features/subscriptions/confirm-addon-payment.ts`; modify `src/lib/commerce/sync.ts` (capture `redemption_id` line-item property) + `src/app/api/shopify/webhooks/route.ts`; Test `tests/features/subscriptions/confirm-addon-payment.test.ts`.

- [ ] **Step 1: Failing test** — `confirmAddonPayment(redemptionId, paidAmount, addonOrderId, supabase)`: advances a `pending_payment` redemption when `paidAmount >= expected_surcharge` (creates synthesized order, status `awaiting_rx`, stores `add_on_shopify_order_id`); does NOT advance when `paidAmount < expected`; no-op for unknown/Non-pending redemption.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** Load the redemption; require `status==='pending_payment'`; if `paidAmount < expected_surcharge` → leave as-is + log (do not advance); else create synthesized order, set `internal_order_id/line_item_id`, `add_on_shopify_order_id`, `status='awaiting_rx'` (or `in_production` for non-Rx), `redeemed_at=now`.

- [ ] **Step 4: Wire the webhook.** In `sync.ts`, where line-item `properties` are scanned (around the existing lens/frame property extraction), also extract `redemption_id`. In the webhook route's `orders/paid` handling, after sync, if the order carries a `redemption_id` property, call `confirmAddonPayment(redemptionId, Number(order.total) /* paid surcharge */, order.shopify_order_id, supabase)`. (Provisioning and add-on confirmation are mutually exclusive per order — a membership purchase has the plan product; an add-on order has a `redemption_id`.)

- [ ] **Step 5: Run → pass + existing webhook tests pass. Commit.**

```bash
git add src/features/subscriptions/confirm-addon-payment.ts src/lib/commerce/sync.ts src/app/api/shopify/webhooks/route.ts tests/features/subscriptions/confirm-addon-payment.test.ts
git commit -m "feat(subscription): add-on payment confirmation with amount verification"
```

---

## Task 6: Abandoned-checkout sweeper (cron)

**Files:** Create `src/features/subscriptions/sweep-abandoned.ts` + `src/app/api/cron/sweep-redemptions/route.ts`; Test `tests/features/subscriptions/sweep-abandoned.test.ts`.

- [ ] **Step 1: Failing test** — `sweepAbandonedRedemptions(supabase)`: redemptions in `pending_payment` with `pending_payment_expires_at < now` are reset to `available` (clear frame/lens/surcharge) and their inventory reservation released (insert `subscription_release` +1 adjustment, increment pool). Returns count released.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** the helper, and a cron route mirroring `src/app/api/cron/rx-reminder/route.ts` auth (`Bearer CRON_SECRET`, timing-safe). Route calls the helper and returns `{ released: n }`.

- [ ] **Step 4: Run → pass. Commit.** (Add the schedule to `vercel.json` cron config if present; if not, note it for deploy.)

```bash
git add src/features/subscriptions/sweep-abandoned.ts src/app/api/cron/sweep-redemptions/route.ts tests/features/subscriptions/sweep-abandoned.test.ts
git commit -m "feat(subscription): abandoned-redemption sweeper cron"
```

---

## Task 7: Redemption status mirroring + retention anchor

**Files:** Create `src/features/subscriptions/advance-redemption.ts`; modify `src/features/admin/actions/generate-work-order.ts` + `src/features/lab/actions/create-shipment.ts`; Test `tests/features/subscriptions/advance-redemption.test.ts`.

- [ ] **Step 1: Failing test** — `advanceRedemptionForOrder(internalOrderId, toStatus, supabase, opts?)`: if a redemption is linked to that internal order, set its `status` (and `work_order_id` / `retention_anchor` when provided); no-op when no redemption links the order (normal Shopify orders).

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** the helper. Then in `generateWorkOrder`, after inserting the work order, call `advanceRedemptionForOrder(rxFile.order_id, 'in_production', supabase, { workOrderId: inserted.id })` (no-ops for non-subscription orders). In `createShipment`, after the shipment is created, call `advanceRedemptionForOrder(wo.order_id, 'shipped', supabase, { retentionAnchor: today })`.

> **Note:** these calls must be safe no-ops for normal orders — the helper updates only rows where `internal_order_id = $orderId`. Keep them out of the compliance gate path (call after success).

- [ ] **Step 4: Run → pass + existing generate-work-order/create-shipment tests pass. Commit.**

```bash
git add src/features/subscriptions/advance-redemption.ts src/features/admin/actions/generate-work-order.ts src/features/lab/actions/create-shipment.ts tests/features/subscriptions/advance-redemption.test.ts
git commit -m "feat(subscription): mirror redemption status through work-order + shipment"
```

---

## Task 8: Dashboard + redemption screens

**Files:** Create `src/app/(site)/account/subscription/page.tsx` + `src/app/(site)/account/subscription/redeem/[slotId]/page.tsx`; modify `src/app/(site)/account/page.tsx`.

- [ ] **Step 1: Dashboard** (`/account/subscription`, server component): `getCurrentCustomer()` → redirect to `/account/login?next=/account/subscription` if null. Load the customer's active membership + its redemptions (service-role read or RLS read). Render: membership status + expiry countdown (`term_end`), one card per redemption — `available` (+`unlocks_at<=now`) → "Use a pair" linking to `/account/subscription/redeem/[slotId]`; in-flight → status label (reuse the `/track` stepper component for shipment states); add-on receipt links. Match existing `(site)/account` styling.

- [ ] **Step 2: Redemption screen** (`/account/subscription/redeem/[slotId]`): frame picker (eligible frames = `product_metadata` where `subscription_tier in ('included','premium')` and in stock; show premium surcharge), lens-option picker (`subscription_addon_options` where active), ship-to address form. Submit → `startRedemption`. On `{checkoutUrl}` redirect to it; on `{ok}` (covered) redirect to `/account/subscription` with a success state.

- [ ] **Step 3:** In `src/app/(site)/account/page.tsx`, replace the "Subscription dashboard will appear here" card with a link to `/account/subscription` (only shown when the customer has a membership; otherwise a "Browse subscriptions" link to the plan/PDP).

- [ ] **Step 4: Verify** `npm run build` (routes present) + `npx tsc --noEmit` + `npm run lint`. Commit.

```bash
git add "src/app/(site)/account/subscription" "src/app/(site)/account/page.tsx"
git commit -m "feat(subscription): /account/subscription dashboard + redemption screens"
```

---

## Task 9: Final verification + review

- [ ] **Step 1:** `npx vitest run` (all green), `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 2:** `supabase db reset` to validate the migration end-to-end (Docker).
- [ ] **Step 3:** Dispatch a `feature-dev:code-reviewer` over the whole branch diff — focus: provisioning idempotency/paid-gate, atomic slot claim race, add-on **amount verification** (can a cheap add-on unlock an expensive pair?), inventory reserve/release correctness, synthesized-order compliance (destination gate + Rx image), RLS (own memberships only), and no money path bypassed.
- [ ] **Step 4:** Address findings via TDD; expect a security review of the redemption/money surface (anonymous-action exposure, IDOR on slotId, amount tampering).
- [ ] **Step 5:** `superpowers:finishing-a-development-branch`.

---

## Self-Review (against spec)

- §2 data model + Keystone-1 alters → Task 1. ✓
- §3 provisioning (idempotent, paid-gated, slots) → Task 2. ✓
- §4 redemption flow: atomic claim → Task 4; surcharge/add-on + amount verify → Tasks 4,5; sweeper → Task 6; synthesized order → Task 3; status mirroring + retention → Task 7. ✓
- §5 dashboard + redemption UI → Task 8. ✓
- §6 compliance (destination gate, Rx image, retention anchor) → Tasks 3,7 (+ inherited 0.5 fixes). ✓
- §7 testing → per-task tests + Task 9. ✓
- Deferred (admin builder, refunds/disputes, end-of-term refund, reuse-stored-Rx) → correctly NOT in any task.

**Flagged integration points for implementers (verify, don't guess):** the `ON CONFLICT`/unique-violation surfacing in Supabase JS (Task 2 Step 3 note); the `alter type add value` transaction caveat (Task 1 note); `sync.ts` property-extraction location (Task 5); whether `startRedemption` needs `'use server'` (depends on the redemption form being client or server).
