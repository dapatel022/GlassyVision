# Non-Rx Fulfillment Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let non-prescription items (storefront sunglasses/plano orders and non-Rx subscription redemptions) flow all the way to *shipped* through the existing lab pipeline, without weakening the FTC "Rx image required" compliance invariant for Rx items.

**Architecture:** Approach A (conditional invariant). `work_orders.rx_file_id` becomes nullable, gated by a new `requires_rx` flag and a CHECK that still forces an Rx image on every Rx work order. A new `generateNonRxWorkOrder(lineItemId)` action (admin-released from a non-Rx queue) creates a non-Rx work order that reuses the existing kanban → QC → `createShipment` → Shopify-fulfillment path; `createShipment` branches on `requires_rx`. Non-Rx subscription redemptions route into a new committed `awaiting_fulfillment` status instead of being wrongly stamped `awaiting_rx`.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript, Supabase (Postgres + service-role client), Vitest (unit), hand-maintained `src/lib/supabase/types.ts`.

**Spec:** `docs/superpowers/specs/2026-06-20-non-rx-fulfillment-design.md`

## Global Constraints

- **Compliance invariant (unchanged):** every Rx work order (`requires_rx = true`) MUST have a non-null `rx_file_id`. Never weaken this for Rx items.
- **No Shopify price hardcoding; no Rx files committed/logged.** (CLAUDE.md.)
- **Phase-1 markets US/CA only** for all items, including non-Rx. Do not open UK.
- **Server actions are a trust boundary:** every `'use server'` export verifies the session/role via `getCurrentUser()` + role check and derives ids from the session — never from parameters. New actions follow this exactly.
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit. Run `npm run lint` before every commit.
- **Test harness:** unit tests mock `@/lib/supabase/admin`'s `createAdminClient` → `{ from: mockFrom }` (per-table chainable mocks) and mock `@/lib/auth/middleware`; the action under test is loaded with a dynamic `await import(...)` AFTER mocks are set. Vitest config only includes `tests/**/*.test.ts(x)`.
- **DB-level constraints (CHECK, enum, triggers) are NOT exercised by the vitest mocks** — they bypass Postgres. Those are verified by SQL review here and at provision time via `supabase db reset` / the Step-8 dev-store test (go-live runbook). Vitest verifies the *application* behavior (what gets inserted, which branch runs, which status is set).

**Baseline:** 384 vitest tests passing, lint + `tsc` clean on `fix/e2e-audit-2026-06-12`.

---

## File Structure

**Created:**
- `supabase/migrations/00036_non_rx_work_orders.sql` — `requires_rx` column, drop `rx_file_id` NOT NULL, conditional CHECK, partial unique index.
- `supabase/migrations/00037_non_rx_redemption_status.sql` — add `awaiting_fulfillment` enum value (alone, so it commits before use).
- `supabase/migrations/00038_guard_awaiting_fulfillment.sql` — add `awaiting_fulfillment` to the membership-terminal guard's committed set.
- `src/features/admin/lib/work-order-number.ts` — shared `buildWorkOrderNumber()` (extracted from generate-work-order for reuse).
- `src/features/admin/actions/generate-non-rx-work-order.ts` — the non-Rx work-order generator.
- `src/features/admin/lib/non-rx-queue.ts` — `getNonRxQueueItems()` testable query.
- `src/app/admin/non-rx-queue/page.tsx` + `client.tsx` — the admin non-Rx release queue.
- Tests: `tests/features/admin/generate-non-rx-work-order.test.ts`, `tests/features/admin/non-rx-queue.test.ts`.

**Modified:**
- `src/lib/supabase/types.ts` — `work_orders` (nullable `rx_file_id` + `requires_rx`); `redemption_status` union (+`awaiting_fulfillment`).
- `src/features/subscriptions/redemption-order.ts` — return `hasRxItems`.
- `src/features/subscriptions/actions/start-redemption.ts` — fork covered-pair status on `hasRxItems`.
- `src/features/subscriptions/confirm-addon-payment.ts` — fork surcharge-pair status on `hasRxItems`.
- `src/app/api/cron/membership-expiry/route.ts` — `COMMITTED_STATUSES` += `awaiting_fulfillment`.
- `src/features/admin/actions/generate-work-order.ts` — import shared `buildWorkOrderNumber`.
- `src/features/lab/actions/create-shipment.ts` — branch Rx checks on `requires_rx`.
- `src/app/admin/layout.tsx` — nav link to the non-Rx queue.
- `src/app/(site)/account/subscription/page.tsx` — label for `awaiting_fulfillment`.
- Extended tests: `tests/features/subscriptions/redemption-order.test.ts`, `start-redemption.test.ts`, `confirm-addon-payment.test.ts`, `tests/app/cron/membership-expiry.test.ts`, `tests/features/lab/shipment-compliance-gate.test.ts`.

---

## Task 1: Schema — `requires_rx` + conditional Rx-image invariant

**Files:**
- Create: `supabase/migrations/00036_non_rx_work_orders.sql`
- Modify: `src/lib/supabase/types.ts:394,426,458` (work_orders Row/Insert/Update)

**Interfaces:**
- Produces: `work_orders.requires_rx boolean` (default true); `work_orders.rx_file_id` now nullable. Type `Database['public']['Tables']['work_orders']['Row'].rx_file_id` is `string | null` and `.requires_rx` is `boolean`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00036_non_rx_work_orders.sql`:

```sql
-- Non-Rx fulfillment: allow a work order for an item with no prescription
-- (plain sunglasses / plano lenses) WITHOUT weakening the FTC compliance
-- invariant for Rx items. Migration 00024 set rx_file_id NOT NULL globally; we
-- replace that blanket rule with a CONDITIONAL one keyed on requires_rx.

alter table work_orders
  add column requires_rx boolean not null default true;

-- Every existing row is an Rx work order (default true) with a non-null
-- rx_file_id, so the conditional CHECK below already holds for all current data.
alter table work_orders
  alter column rx_file_id drop not null;

-- The compliance invariant, now conditional: an Rx work order MUST still have
-- an Rx image on file; a non-Rx work order may have none.
alter table work_orders
  add constraint work_orders_rx_image_required
  check (requires_rx = false or rx_file_id is not null);

-- Non-Rx idempotency: the Rx path dedups on rx_file_id (guarded in code); the
-- non-Rx path dedups on line_item_id. A line item is either Rx or non-Rx, so a
-- partial unique index over non-Rx rows prevents duplicate non-Rx work orders.
create unique index work_orders_non_rx_line_item_uniq
  on work_orders(line_item_id) where requires_rx = false;
```

- [ ] **Step 2: Update the hand-maintained types**

In `src/lib/supabase/types.ts`, in the `work_orders` table block:

- In **Row** (line ~394): change `rx_file_id: string;` to `rx_file_id: string | null;` and add on the next line `requires_rx: boolean;`
- In **Insert** (line ~426): change `rx_file_id: string;` to `rx_file_id?: string | null;` and add `requires_rx?: boolean;`
- In **Update** (line ~458): change `rx_file_id?: string;` to `rx_file_id?: string | null;` and add `requires_rx?: boolean;`

- [ ] **Step 3: Type-check and run the suite to verify no regressions**

Run: `npx tsc --noEmit && npm test`
Expected: `tsc` clean; 384 tests still pass. (`create-shipment.ts` and `src/app/lab/work-orders/[id]/page.tsx` already guard `rx_file_id` before use, so narrowing `string | null` does not break them.) If `tsc` reports a `'string | null' is not assignable to 'string'` anywhere, add a `if (!x.rx_file_id) return ...` / `?? ''` guard at that site and re-run.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00036_non_rx_work_orders.sql src/lib/supabase/types.ts
git commit -m "feat(schema): conditional Rx-image invariant on work_orders (requires_rx)"
```

---

## Task 2: Schema — `awaiting_fulfillment` committed redemption status

**Files:**
- Create: `supabase/migrations/00037_non_rx_redemption_status.sql`, `supabase/migrations/00038_guard_awaiting_fulfillment.sql`
- Modify: `src/lib/supabase/types.ts:1410` (redemption_status union); `src/app/api/cron/membership-expiry/route.ts:20` (COMMITTED_STATUSES)
- Test: `tests/app/cron/membership-expiry.test.ts`

**Interfaces:**
- Produces: `redemption_status` now includes `'awaiting_fulfillment'`, a COMMITTED status (blocks terminal membership transitions; expiry cron and the DB guard both treat it as committed).

- [ ] **Step 1: Write the enum migration (value added alone so it commits before use)**

Create `supabase/migrations/00037_non_rx_redemption_status.sql`:

```sql
-- A non-Rx subscription redemption that has a synthesized order + reserved
-- inventory but has not yet been released to the lab. It is COMMITTED (money
-- captured / inventory held) and must block a terminal membership transition,
-- exactly like awaiting_rx — but it routes through the non-Rx admin queue, not
-- the Rx queue. Distinct from in_production, which means the lab is already
-- cutting. Added in its own migration so the value is committed before any
-- later migration references it (Postgres forbids using a new enum value in the
-- same transaction that added it).
alter type redemption_status add value if not exists 'awaiting_fulfillment';
```

- [ ] **Step 2: Write the guard-trigger migration**

Create `supabase/migrations/00038_guard_awaiting_fulfillment.sql`:

```sql
-- Add awaiting_fulfillment to the committed set guarded by the terminal trigger
-- (mirrors COMMITTED_STATUSES in the membership-expiry cron). A non-Rx pair in
-- flight must not be silently dropped by an expiry/refund/cancel.
create or replace function guard_membership_terminal()
returns trigger language plpgsql as $$
begin
  if new.status in ('expired','refunded','cancelled') then
    if exists (
      select 1 from subscription_redemptions r
      where r.membership_id = new.id
        and r.status in ('awaiting_rx','awaiting_fulfillment','in_review','in_production','shipped')
    ) then
      raise exception 'cannot set membership % to % while a slot is committed', new.id, new.status;
    end if;
  end if;
  return new;
end $$;
```

- [ ] **Step 3: Update the types union**

In `src/lib/supabase/types.ts` line ~1410, add `| 'awaiting_fulfillment'` to the `redemption_status` union (place it after `'awaiting_rx'`):

```ts
      redemption_status: 'available' | 'locked' | 'pending_payment' | 'awaiting_rx' | 'awaiting_fulfillment' | 'in_review' | 'in_production' | 'shipped' | 'delivered' | 'cancelled' | 'expired' | 'rx_rejected';
```

- [ ] **Step 4: Update the expiry cron's committed set**

In `src/app/api/cron/membership-expiry/route.ts` line 20:

```ts
const COMMITTED_STATUSES = ['awaiting_rx', 'awaiting_fulfillment', 'in_review', 'in_production', 'shipped'] as const;
```

> Note: `handle-refund.ts` defines committed by *exclusion* (`UNCOMMITTED_STATUSES = ['available','locked','pending_payment']` and treats everything else as committed), so `awaiting_fulfillment` is already handled correctly there — no change needed.

- [ ] **Step 5: Write the failing test**

In `tests/app/cron/membership-expiry.test.ts`, add a test inside the top-level `describe` (use the existing `mockSupabase`, `req`, and `NOW` helpers). A membership at end-of-term whose only slot is `awaiting_fulfillment` must be treated as committed — same as `awaiting_rx` — so it is NOT force-expired/refunded:

```ts
it('treats awaiting_fulfillment as committed (does not expire a non-Rx pair in flight)', async () => {
  const { client, updates } = mockSupabase({
    memberships: [
      { id: 'm-1', shopify_order_id: 1, currency: 'usd', term_end: '2026-06-14', status: 'active', end_of_term_policy: 'refund_unredeemed' },
    ],
    redemptions: { 'm-1': [{ status: 'awaiting_fulfillment' }] },
  });
  createAdminClient.mockReturnValue(client);

  const res = await GET(req('test-secret'));
  expect(res.status).toBe(200);

  // No membership row was flipped to expired/refunded while a slot is committed.
  const terminal = updates.filter(
    (u) => u.table === 'subscription_memberships' && ['expired', 'refunded'].includes(String(u.values.status)),
  );
  expect(terminal).toHaveLength(0);
});
```

> If the existing `mockSupabase`/membership fields differ from the snippet, mirror the shape used by the file's existing `awaiting_rx` committed-status test rather than the literal above — the assertion (no terminal flip while a slot is committed) is the contract.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/app/cron/membership-expiry.test.ts`
Expected: PASS (the new case + all existing cases).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00037_non_rx_redemption_status.sql supabase/migrations/00038_guard_awaiting_fulfillment.sql src/lib/supabase/types.ts src/app/api/cron/membership-expiry/route.ts tests/app/cron/membership-expiry.test.ts
git commit -m "feat(subscription): awaiting_fulfillment committed status for non-Rx pairs"
```

---

## Task 3: Redemption fork — non-Rx pairs route to `awaiting_fulfillment`

**Files:**
- Modify: `src/features/subscriptions/redemption-order.ts:34-105` (return `hasRxItems`)
- Modify: `src/features/subscriptions/actions/start-redemption.ts:189-213`
- Modify: `src/features/subscriptions/confirm-addon-payment.ts:157-181`
- Modify: `src/app/(site)/account/subscription/page.tsx:20-22` (customer label)
- Test: `tests/features/subscriptions/redemption-order.test.ts`, `start-redemption.test.ts`, `confirm-addon-payment.test.ts`

**Interfaces:**
- Consumes: `awaiting_fulfillment` status (Task 2).
- Produces: `createRedemptionFulfillmentOrder(...)` now returns `{ orderId: string; lineItemId: string; hasRxItems: boolean }`. Callers set redemption status `= hasRxItems ? 'awaiting_rx' : 'awaiting_fulfillment'`.

- [ ] **Step 1: Write the failing test for the return value**

In `tests/features/subscriptions/redemption-order.test.ts`, add (follow the file's existing supabase-mock style):

```ts
it('returns hasRxItems=false for a non-Rx-capable frame', async () => {
  // product_metadata.is_rx_capable = false → non-Rx order.
  const { supabase } = buildOrderMock({ isRxCapable: false, lensType: 'non_prescription' });
  const { createRedemptionFulfillmentOrder } = await import('@/features/subscriptions/redemption-order');
  const result = await createRedemptionFulfillmentOrder(baseRedemption(), supabase);
  expect(result.hasRxItems).toBe(false);
});

it('returns hasRxItems=true for an Rx-capable frame with an Rx lens', async () => {
  const { supabase } = buildOrderMock({ isRxCapable: true, lensType: 'single_vision' });
  const { createRedemptionFulfillmentOrder } = await import('@/features/subscriptions/redemption-order');
  const result = await createRedemptionFulfillmentOrder(baseRedemption({ lens_config: { lens_type: 'single_vision' } }), supabase);
  expect(result.hasRxItems).toBe(true);
});
```

> Reuse the file's existing mock builder + redemption fixture if present; if the file has no shared helpers, model `buildOrderMock`/`baseRedemption` on the per-table mock pattern in `tests/features/admin/generate-work-order.test.ts` (a `product_metadata` table returning `{ is_rx_capable, sku, frame_shape }`, and `orders`/`order_line_items` inserts returning `{ id }`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/features/subscriptions/redemption-order.test.ts`
Expected: FAIL — `result.hasRxItems` is `undefined`.

- [ ] **Step 3: Return `hasRxItems` from `createRedemptionFulfillmentOrder`**

In `src/features/subscriptions/redemption-order.ts`:

Change the function's return type (line ~37):

```ts
): Promise<{ orderId: string; lineItemId: string; hasRxItems: boolean }> {
```

Change the final return (line ~104):

```ts
  return { orderId: order.id, lineItemId: lineItem.id, hasRxItems };
```

(`hasRxItems` is already computed at line ~54.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/features/subscriptions/redemption-order.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the covered-pair fork (start-redemption)**

In `tests/features/subscriptions/start-redemption.test.ts`, add a case asserting a covered **non-Rx** pair lands in `awaiting_fulfillment` (capture the status written to `subscription_redemptions`). Follow the file's existing covered-pair test setup, but make `createRedemptionFulfillmentOrder` resolve `{ orderId, lineItemId, hasRxItems: false }`:

```ts
it('routes a covered non-Rx pair to awaiting_fulfillment (not awaiting_rx)', async () => {
  // ...existing covered-pair arrange: signed-in customer, owned+active membership,
  // slot claimable, reserve_inventory_unit returns a pool id, no surcharge...
  // Mock the fulfillment-order helper to report a non-Rx order:
  vi.mocked(createRedemptionFulfillmentOrder).mockResolvedValue({ orderId: 'o-1', lineItemId: 'li-1', hasRxItems: false });

  const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
  await startRedemption(coveredInput());

  const statusWrite = redemptionUpdates.find((u) => u.values.status === 'awaiting_fulfillment');
  expect(statusWrite).toBeTruthy();
  expect(redemptionUpdates.some((u) => u.values.status === 'awaiting_rx')).toBe(false);
});
```

> If the existing tests don't already mock `@/features/subscriptions/redemption-order`, add `vi.mock('@/features/subscriptions/redemption-order', () => ({ createRedemptionFulfillmentOrder: vi.fn() }))` at the top and import the mocked symbol. Keep the existing Rx covered-pair test (it should still resolve `hasRxItems: true` → `awaiting_rx`); update that mock's resolved value to include `hasRxItems: true`.

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/features/subscriptions/start-redemption.test.ts`
Expected: FAIL — status written is `awaiting_rx`.

- [ ] **Step 7: Fork the covered-pair status in start-redemption**

In `src/features/subscriptions/actions/start-redemption.ts`, in the covered-pair branch (lines ~189-213), capture `hasRxItems` and use it:

```ts
  if (!hasSurcharge && expectedSurcharge === 0) {
    // Covered pair — create the synthesized fulfillment order immediately.
    const { orderId, lineItemId, hasRxItems } = await createRedemptionFulfillmentOrder(
      {
        id: input.slotId,
        frame_variant_id: input.frameVariantId,
        lens_config: input.lensConfig,
        ship_to: input.shipTo,
        membership: { customer_id: customer.id, customer_email: customer.email, currency: membership.currency },
      },
      supabase,
    );

    await supabase
      .from('subscription_redemptions')
      .update({
        // Rx pairs await the customer's prescription; non-Rx pairs are committed
        // and wait in the admin non-Rx queue for release to the lab.
        status: hasRxItems ? 'awaiting_rx' : 'awaiting_fulfillment',
        internal_order_id: orderId,
        internal_line_item_id: lineItemId,
        redeemed_at: new Date().toISOString(),
      })
      .eq('id', input.slotId);

    return { ok: true };
  }
```

(Note the local `hasSurcharge` shadow: this branch's existing variable is named `hasSurcharge`; do not rename it. Only add `hasRxItems` to the destructure and use it in the `status` field.)

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/features/subscriptions/start-redemption.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing test for the surcharge fork (confirm-addon-payment)**

In `tests/features/subscriptions/confirm-addon-payment.test.ts`, add a case: a fully-paid **non-Rx** surcharge pair advances to `awaiting_fulfillment`. Mirror the file's existing "advances on valid payment" test but make `createRedemptionFulfillmentOrder` resolve `hasRxItems: false`:

```ts
it('advances a paid non-Rx surcharge pair to awaiting_fulfillment', async () => {
  vi.mocked(createRedemptionFulfillmentOrder).mockResolvedValue({ orderId: 'o-1', lineItemId: 'li-1', hasRxItems: false });
  // ...existing valid-payment arrange (redemption pending_payment, required variants present, subtotal >= expected)...
  const { confirmAddonPayment } = await import('@/features/subscriptions/confirm-addon-payment');
  const result = await confirmAddonPayment('r-1', validFacts(), 999, supabase);
  expect(result.advanced).toBe(true);
  expect(redemptionUpdates.some((u) => u.values.status === 'awaiting_fulfillment')).toBe(true);
});
```

> The existing "advances" test should keep asserting `awaiting_rx` — update its `createRedemptionFulfillmentOrder` mock to resolve `hasRxItems: true`.

- [ ] **Step 10: Run to verify it fails**

Run: `npx vitest run tests/features/subscriptions/confirm-addon-payment.test.ts`
Expected: FAIL — status written is `awaiting_rx`.

- [ ] **Step 11: Fork the status in confirm-addon-payment**

In `src/features/subscriptions/confirm-addon-payment.ts`, change the destructure (line ~157) and the status write (line ~175):

```ts
  const { orderId, lineItemId, hasRxItems } = await createRedemptionFulfillmentOrder(
    // ...unchanged args...
  );

  await supabase
    .from('subscription_redemptions')
    .update({
      status: hasRxItems ? 'awaiting_rx' : 'awaiting_fulfillment',
      internal_order_id: orderId,
      internal_line_item_id: lineItemId,
      add_on_shopify_order_id: addonShopifyOrderId,
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', redemptionId);
```

- [ ] **Step 12: Run to verify it passes**

Run: `npx vitest run tests/features/subscriptions/confirm-addon-payment.test.ts`
Expected: PASS.

- [ ] **Step 13: Add the customer-facing label**

In `src/app/(site)/account/subscription/page.tsx`, in the status-label map (lines ~20-22), add the `awaiting_fulfillment` entry so a non-Rx redemption no longer shows a raw enum:

```ts
  awaiting_rx: 'Awaiting your prescription',
  awaiting_fulfillment: 'Being prepared',
  in_review: 'Prescription in review',
  in_production: 'In production at the lab',
```

- [ ] **Step 14: Type-check, lint, full suite, commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean; all green.

```bash
git add src/features/subscriptions/redemption-order.ts src/features/subscriptions/actions/start-redemption.ts src/features/subscriptions/confirm-addon-payment.ts "src/app/(site)/account/subscription/page.tsx" tests/features/subscriptions/redemption-order.test.ts tests/features/subscriptions/start-redemption.test.ts tests/features/subscriptions/confirm-addon-payment.test.ts
git commit -m "feat(subscription): route non-Rx redemptions to awaiting_fulfillment"
```

---

## Task 4: `generateNonRxWorkOrder(lineItemId)` action

**Files:**
- Create: `src/features/admin/lib/work-order-number.ts`
- Modify: `src/features/admin/actions/generate-work-order.ts:26-30` (use shared helper)
- Create: `src/features/admin/actions/generate-non-rx-work-order.ts`
- Test: `tests/features/admin/generate-non-rx-work-order.test.ts`

**Interfaces:**
- Consumes: `work_orders.requires_rx` (Task 1); `advanceRedemptionForOrder(internalOrderId, toStatus, supabase, opts)` from `@/features/subscriptions/advance-redemption`; `isDispensableDestination` from `@/lib/rx/market`; `getCurrentUser`/`isAdminRole` from `@/lib/auth/middleware`.
- Produces: `generateNonRxWorkOrder(lineItemId: string): Promise<{ success: true; workOrderId: string; workOrderNumber: string } | { success: false; error: string }>`.

- [ ] **Step 1: Extract the shared work-order-number helper**

Create `src/features/admin/lib/work-order-number.ts`:

```ts
/** Build the monthly-sequenced work order number, e.g. WO-202606-007. */
export function buildWorkOrderNumber(sequence: number): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `WO-${yyyymm}-${String(sequence).padStart(3, '0')}`;
}
```

In `src/features/admin/actions/generate-work-order.ts`, delete the local `buildWorkOrderNumber` (lines ~26-30) and add the import near the top:

```ts
import { buildWorkOrderNumber } from '@/features/admin/lib/work-order-number';
```

- [ ] **Step 2: Verify the Rx generator still passes after extraction**

Run: `npx vitest run tests/features/admin/generate-work-order.test.ts`
Expected: PASS (behavior unchanged; pure refactor).

- [ ] **Step 3: Write the failing tests for the non-Rx generator**

Create `tests/features/admin/generate-non-rx-work-order.test.ts` (mirror the mock style of `generate-work-order.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from: mockFrom })) }));

const getCurrentUser = vi.fn(() => Promise.resolve({ id: 'admin-1', email: 'a@x.com', role: 'founder', fullName: 'A' }));
vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: () => getCurrentUser(),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

const advanceRedemptionForOrder = vi.fn(() => Promise.resolve({ advanced: false }));
vi.mock('@/features/subscriptions/advance-redemption', () => ({
  advanceRedemptionForOrder: (...a: unknown[]) => advanceRedemptionForOrder(...a),
}));

// A non-Rx, paid, US line item with no existing work order.
function installClient(opts: { isRxRequired?: boolean; financialStatus?: string; country?: string; existingWo?: { id: string; work_order_number: string } | null } = {}) {
  const { isRxRequired = false, financialStatus = 'paid', country = 'US', existingWo = null } = opts;
  const workOrderInsert = vi.fn(() => ({
    select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'wo-9', work_order_number: 'WO-202606-009' }, error: null })) })),
  }));
  const labJobInsert = vi.fn(() => Promise.resolve({ error: null }));
  mockFrom.mockImplementation((table: string) => {
    if (table === 'order_line_items') return {
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: {
        id: 'li-1', order_id: 'o-1', sku: 'GV-SUN-01', product_title: 'Sun', frame_shape: 'square', frame_color: 'black', frame_size: 'M', is_rx_required: isRxRequired,
        orders: { financial_status: financialStatus, billing_country: country.toLowerCase(), shipping_address: { country_code: country } },
      }, error: null }) }) }),
    };
    if (table === 'work_orders') return {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: existingWo, error: null }) }), gte: () => Promise.resolve({ data: [], error: null, count: 0 }) }) }),
      insert: workOrderInsert,
    };
    if (table === 'lab_jobs') return { insert: labJobInsert };
    if (table === 'audit_log') return { insert: vi.fn(() => Promise.resolve({ error: null })) };
    return {};
  });
  return { workOrderInsert, labJobInsert };
}

beforeEach(() => { mockFrom.mockReset(); advanceRedemptionForOrder.mockClear(); getCurrentUser.mockClear(); });

describe('generateNonRxWorkOrder', () => {
  it('rejects a non-admin caller before any DB write', async () => {
    getCurrentUser.mockResolvedValueOnce({ id: 'c-1', email: 'c@x.com', role: 'customer', fullName: 'C' });
    const { workOrderInsert } = installClient();
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(false);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('rejects a line item that requires a prescription', async () => {
    const { workOrderInsert } = installClient({ isRxRequired: true });
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/prescription|rx queue/i);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('rejects a non-US/CA destination', async () => {
    const { workOrderInsert } = installClient({ country: 'GB' });
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(false);
    expect(workOrderInsert).not.toHaveBeenCalled();
  });

  it('creates a non-Rx work order (requires_rx=false, null rx_file_id) + lab job and advances any linked redemption', async () => {
    const { workOrderInsert, labJobInsert } = installClient();
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(true);
    expect(workOrderInsert).toHaveBeenCalledTimes(1);
    const inserted = workOrderInsert.mock.calls[0][0];
    expect(inserted.requires_rx).toBe(false);
    expect(inserted.rx_file_id ?? null).toBeNull();
    expect(inserted.lens_type).toBe('non_prescription');
    expect(inserted.released_to_lab_at).toBeTruthy();
    expect(labJobInsert).toHaveBeenCalledTimes(1);
    expect(advanceRedemptionForOrder).toHaveBeenCalledWith('o-1', 'in_production', expect.anything(), expect.objectContaining({ workOrderId: 'wo-9' }));
  });

  it('is idempotent — returns the existing work order without inserting a duplicate', async () => {
    const { workOrderInsert } = installClient({ existingWo: { id: 'wo-existing', work_order_number: 'WO-202606-001' } });
    const { generateNonRxWorkOrder } = await import('@/features/admin/actions/generate-non-rx-work-order');
    const result = await generateNonRxWorkOrder('li-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.workOrderId).toBe('wo-existing');
    expect(workOrderInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run tests/features/admin/generate-non-rx-work-order.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the action**

Create `src/features/admin/actions/generate-non-rx-work-order.ts`:

```ts
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import { isDispensableDestination } from '@/lib/rx/market';
import { advanceRedemptionForOrder } from '@/features/subscriptions/advance-redemption';
import { buildWorkOrderNumber } from '@/features/admin/lib/work-order-number';
import type { Json } from '@/lib/supabase/types';

export type GenerateNonRxWorkOrderResult =
  | { success: true; workOrderId: string; workOrderNumber: string }
  | { success: false; error: string };

/**
 * Release a NON-prescription line item to the lab. Mirror of generateWorkOrder
 * for items with no Rx (plain sunglasses / plano). Admin-gated; the admin's
 * "Release to lab" click and work-order generation collapse into one step here
 * (there is no Rx review in between), so released_to_lab_at is set now.
 *
 * The compliance invariant is preserved by construction: requires_rx=false +
 * rx_file_id=null is exactly the row the conditional CHECK (migration 00036)
 * permits, and createShipment skips the Rx gates only when requires_rx=false.
 */
export async function generateNonRxWorkOrder(lineItemId: string): Promise<GenerateNonRxWorkOrderResult> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  const supabase = createAdminClient();

  const { data: li, error: liErr } = await supabase
    .from('order_line_items')
    .select('id, order_id, sku, product_title, frame_shape, frame_color, frame_size, is_rx_required, orders ( financial_status, billing_country, shipping_address )')
    .eq('id', lineItemId)
    .single();

  if (liErr || !li) return { success: false, error: 'Line item not found' };

  const order = (li as unknown as { orders: { financial_status: string | null; billing_country: string | null; shipping_address: unknown } | null }).orders;

  // Only non-Rx items use this path; an Rx line item must go through the Rx queue.
  if (li.is_rx_required) {
    return { success: false, error: 'This item requires a prescription — use the Rx queue.' };
  }
  // Don't commit lab time/inventory against an unpaid order.
  if (!order || order.financial_status !== 'paid') {
    return { success: false, error: 'Order is not paid' };
  }
  // Phase-1 market gate (US/CA), same as the Rx path.
  if (!isDispensableDestination(order.shipping_address as { country_code?: string } | null, order.billing_country)) {
    return { success: false, error: 'Shipping is restricted to US/CA in phase 1' };
  }

  // Idempotency: one non-Rx work order per line item (partial unique index +
  // this guard). A repeated release returns the existing work order.
  const { data: existing } = await supabase
    .from('work_orders')
    .select('id, work_order_number')
    .eq('line_item_id', lineItemId)
    .eq('requires_rx', false)
    .maybeSingle();
  if (existing) {
    return { success: true, workOrderId: existing.id, workOrderNumber: existing.work_order_number };
  }

  const { count } = await supabase
    .from('work_orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
  const workOrderNumber = buildWorkOrderNumber((count ?? 0) + 1);

  const { data: inserted, error: insertError } = await supabase
    .from('work_orders')
    .insert({
      order_id: li.order_id,
      line_item_id: li.id,
      rx_file_id: null,
      requires_rx: false,
      work_order_number: workOrderNumber,
      frame_sku: li.sku ?? 'UNKNOWN',
      frame_shape: li.frame_shape,
      frame_color: li.frame_color,
      frame_size: li.frame_size,
      lens_type: 'non_prescription',
      lens_material: 'cr39',
      coatings: [] as unknown as Json,
      tint: 'none',
      released_to_lab_at: new Date().toISOString(),
    })
    .select('id, work_order_number')
    .single();

  if (insertError || !inserted) {
    return { success: false, error: 'Failed to create work order' };
  }

  const { error: jobError } = await supabase
    .from('lab_jobs')
    .insert({ work_order_id: inserted.id, column: 'inbox', priority: 5 });
  if (jobError) {
    return { success: false, error: 'Work order created but lab job failed' };
  }

  const { error: auditError } = await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'non_rx_work_order_generated',
    entity_type: 'work_orders',
    entity_id: inserted.id,
    after_data: { work_order_number: inserted.work_order_number, line_item_id: li.id } as unknown as Json,
  });
  if (auditError) {
    console.error('[generate-non-rx-work-order] audit_log insert failed', { workOrderId: inserted.id, error: auditError });
  }

  // Mirror onto a linked subscription redemption (no-op for storefront orders).
  await advanceRedemptionForOrder(li.order_id, 'in_production', supabase, { workOrderId: inserted.id });

  return { success: true, workOrderId: inserted.id, workOrderNumber: inserted.work_order_number };
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/features/admin/generate-non-rx-work-order.test.ts tests/features/admin/generate-work-order.test.ts`
Expected: PASS (both files).

- [ ] **Step 7: Type-check, lint, commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src/features/admin/lib/work-order-number.ts src/features/admin/actions/generate-work-order.ts src/features/admin/actions/generate-non-rx-work-order.ts tests/features/admin/generate-non-rx-work-order.test.ts
git commit -m "feat(admin): generateNonRxWorkOrder — release non-Rx items to the lab"
```

---

## Task 5: `createShipment` branches on `requires_rx`

**Files:**
- Modify: `src/features/lab/actions/create-shipment.ts:50-108`
- Test: `tests/features/lab/shipment-compliance-gate.test.ts`

**Interfaces:**
- Consumes: `work_orders.requires_rx` (Task 1).
- Produces: a non-Rx job (`requires_rx=false`) ships when release + QC photo + US/CA destination pass, skipping the Rx-image/approval/expiration checks. Rx job behavior unchanged.

- [ ] **Step 1: Write the failing tests (extend the gate suite)**

In `tests/features/lab/shipment-compliance-gate.test.ts`, extend `installClient` to support a non-Rx work order, then add a `describe` block. Add a `requiresRx`/`rxFileId` option:

```ts
// In ClientOpts:  requiresRx?: boolean; rxFileId?: string | null;
// In installClient destructure: requiresRx = true, rxFileId = 'rx-1'
// In the 'work_orders' case, return requires_rx + rx_file_id from opts:
//   data: { order_id: 'o-1', line_item_id: 'li-1', rx_file_id: rxFileId, requires_rx: requiresRx, released_to_lab_at: '2026-05-01T00:00:00Z' }
// In the 'lab_jobs' case, parameterize qc_photos so a "missing QC" case can pass [].
```

Then:

```ts
describe('createShipment — non-Rx items', () => {
  it('ships a non-Rx job with QC + release + US destination (no Rx file needed)', async () => {
    installClient({ requiresRx: false, rxFileId: null });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });
    expect(result.success).toBe(true);
  });

  it('still blocks a non-Rx job that has no QC photo', async () => {
    installClient({ requiresRx: false, rxFileId: null, qcPhotos: [] });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/QC/i);
  });

  it('still blocks a non-Rx job shipping to a non-US/CA destination', async () => {
    installClient({ requiresRx: false, rxFileId: null, shippingAddress: { country_code: 'GB' } });
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: 'TRK' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/US\/CA|dispens|restrict/i);
  });
});
```

> Add `qcPhotos?: string[]` to `ClientOpts` (default `['qc/1.jpg']`) and use it in the `lab_jobs` mock's `qc_photos`. The existing Rx tests keep `requiresRx` defaulting to `true`, so they are unaffected.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/features/lab/shipment-compliance-gate.test.ts`
Expected: FAIL — the non-Rx "ships" case fails because the current gate hard-blocks on `!wo.rx_file_id`.

- [ ] **Step 3: Branch the gate on `requires_rx`**

In `src/features/lab/actions/create-shipment.ts`:

Add `requires_rx` to the work-order select (line ~50-54):

```ts
  const { data: wo } = await supabase
    .from('work_orders')
    .select('order_id, line_item_id, rx_file_id, requires_rx, released_to_lab_at')
    .eq('id', job.work_order_id)
    .single();
  if (!wo) return { success: false, error: 'Work order not found' };
```

Wrap the Rx-specific checks (the current lines ~57-87: the `!wo.rx_file_id` block, the `rx_files` fetch + image/deleted check, the expiration check, and the `rx_reviews` approval check) in `if (wo.requires_rx) { ... }`:

```ts
  // --- Compliance gate -------------------------------------------------
  // Rx items must clear the full prescription gate. Non-Rx items (plain
  // sunglasses / plano) have no prescription, so these checks are skipped —
  // but the release / QC / destination gates below ALWAYS apply.
  if (wo.requires_rx) {
    if (!wo.rx_file_id) {
      return { success: false, error: 'Cannot ship: no Rx file on record for this work order' };
    }

    const { data: rxFile } = await supabase
      .from('rx_files')
      .select('id, storage_path, deleted_at, rx_expiration_date')
      .eq('id', wo.rx_file_id)
      .single();
    if (!rxFile || !rxFile.storage_path || rxFile.deleted_at) {
      return { success: false, error: 'Cannot ship: Rx image is missing or has been removed' };
    }

    if (isRxExpired(rxFile.rx_expiration_date)) {
      return { success: false, error: 'Cannot ship: the prescription on file has expired' };
    }

    const { data: reviews } = await supabase
      .from('rx_reviews')
      .select('decision')
      .eq('rx_file_id', wo.rx_file_id)
      .order('reviewed_at', { ascending: false });
    const latestReview = (reviews ?? [])[0];
    if (!latestReview || latestReview.decision !== 'approved') {
      return { success: false, error: 'Cannot ship: Rx has not been approved by an admin' };
    }
  }

  if (!wo.released_to_lab_at) {
    return { success: false, error: 'Cannot ship: work order was never released to the lab' };
  }

  const qcPhotos = (job.qc_photos as unknown as unknown[]) ?? [];
  if (qcPhotos.length === 0) {
    return { success: false, error: 'Cannot ship: QC photos are required before shipment' };
  }
```

Leave the destination gate (the `orders` fetch + `isDispensableDestination` check, current lines ~98-108) and everything after it unchanged — it already applies to all jobs.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/features/lab/shipment-compliance-gate.test.ts`
Expected: PASS (new non-Rx cases + all existing Rx cases).

- [ ] **Step 5: Type-check, lint, full suite, commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean; all green.

```bash
git add src/features/lab/actions/create-shipment.ts tests/features/lab/shipment-compliance-gate.test.ts
git commit -m "feat(lab): createShipment skips Rx gates for non-Rx items (keeps QC + destination)"
```

---

## Task 6: Admin non-Rx queue (query + page + nav)

**Files:**
- Create: `src/features/admin/lib/non-rx-queue.ts`
- Test: `tests/features/admin/non-rx-queue.test.ts`
- Create: `src/app/admin/non-rx-queue/page.tsx`, `src/app/admin/non-rx-queue/client.tsx`
- Modify: `src/app/admin/layout.tsx:32` (nav link)

**Interfaces:**
- Consumes: `generateNonRxWorkOrder(lineItemId)` (Task 4).
- Produces: `getNonRxQueueItems(supabase): Promise<NonRxQueueItem[]>` where `NonRxQueueItem = { lineItemId: string; orderId: string; orderNumber: string | null; productTitle: string; sku: string | null; country: string | null }` — paid, non-Rx line items with no work order yet, in non-shipped/cancelled orders.

- [ ] **Step 1: Write the failing test for the query**

Create `tests/features/admin/non-rx-queue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
function makeClient() { return { from: mockFrom }; }

beforeEach(() => mockFrom.mockReset());

describe('getNonRxQueueItems', () => {
  it('returns paid non-Rx line items that have no work order yet', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'order_line_items') return {
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [
          { id: 'li-1', order_id: 'o-1', sku: 'GV-SUN', product_title: 'Sun', is_rx_required: false,
            orders: { shopify_order_number: '1001', financial_status: 'paid', fulfillment_status: 'unfulfilled', shipping_address: { country_code: 'US' } } },
          { id: 'li-2', order_id: 'o-2', sku: 'GV-SUN2', product_title: 'Sun2', is_rx_required: false,
            orders: { shopify_order_number: '1002', financial_status: 'paid', fulfillment_status: 'unfulfilled', shipping_address: { country_code: 'CA' } } },
        ], error: null }) }) }),
      };
      // li-2 already has a non-Rx work order → must be excluded.
      if (table === 'work_orders') return {
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [{ line_item_id: 'li-2' }], error: null }) }) }),
      };
      return {};
    });

    const { getNonRxQueueItems } = await import('@/features/admin/lib/non-rx-queue');
    const items = await getNonRxQueueItems(makeClient() as never);
    expect(items.map((i) => i.lineItemId)).toEqual(['li-1']);
    expect(items[0]).toMatchObject({ orderId: 'o-1', orderNumber: '1001', country: 'US' });
  });

  it('returns an empty list when no non-Rx line items are waiting', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'order_line_items') return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
      if (table === 'work_orders') return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
      return {};
    });
    const { getNonRxQueueItems } = await import('@/features/admin/lib/non-rx-queue');
    const items = await getNonRxQueueItems(makeClient() as never);
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/features/admin/non-rx-queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the query**

Create `src/features/admin/lib/non-rx-queue.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface NonRxQueueItem {
  lineItemId: string;
  orderId: string;
  orderNumber: string | null;
  productTitle: string;
  sku: string | null;
  country: string | null;
}

/**
 * Line items awaiting non-Rx release to the lab: paid, non-Rx, in a
 * not-yet-shipped/cancelled order, and without a work order yet. Both sources
 * surface here — storefront sunglasses line items and subscription synthesized
 * line items (their orders are financial_status='paid', order_source='subscription').
 */
export async function getNonRxQueueItems(supabase: SupabaseClient): Promise<NonRxQueueItem[]> {
  const { data: candidates } = await supabase
    .from('order_line_items')
    .select('id, order_id, sku, product_title, is_rx_required, orders ( shopify_order_number, financial_status, fulfillment_status, shipping_address )')
    .eq('is_rx_required', false)
    .in('order_id', []); // placeholder replaced below

  // NOTE: PostgREST can't filter on the embedded order's columns in one call
  // cleanly, so filter in JS after the embed. (Volumes are admin-scale.)
  const rows = (candidates ?? []) as unknown as Array<{
    id: string; order_id: string; sku: string | null; product_title: string; is_rx_required: boolean;
    orders: { shopify_order_number: string | null; financial_status: string | null; fulfillment_status: string | null; shipping_address: { country_code?: string } | null } | null;
  }>;

  const paidPending = rows.filter(
    (r) => r.orders?.financial_status === 'paid' && r.orders?.fulfillment_status !== 'shipped' && r.orders?.fulfillment_status !== 'cancelled',
  );

  const lineItemIds = paidPending.map((r) => r.id);
  const { data: existing } = await supabase
    .from('work_orders')
    .select('line_item_id')
    .eq('requires_rx', false)
    .in('line_item_id', lineItemIds.length > 0 ? lineItemIds : ['00000000-0000-0000-0000-000000000000']);
  const released = new Set((existing ?? []).map((w: { line_item_id: string }) => w.line_item_id));

  return paidPending
    .filter((r) => !released.has(r.id))
    .map((r) => ({
      lineItemId: r.id,
      orderId: r.order_id,
      orderNumber: r.orders?.shopify_order_number ?? null,
      productTitle: r.product_title,
      sku: r.sku,
      country: r.orders?.shipping_address?.country_code ?? null,
    }));
}
```

> Implementation note for the engineer: the `.in('order_id', [])` placeholder above is wrong on purpose to keep the query readable in the diff — replace it with a real selection of non-Rx line items. The simplest correct form drops the `.in(...)` entirely and selects all `is_rx_required=false` line items, then filters in JS (as the test mocks: `select → eq('is_rx_required', false) → in(...)`). Match the **test's mock chain** exactly: `from('order_line_items').select(...).eq('is_rx_required', false).in('order_id', <ids-or-sentinel>)` is NOT required — the test mocks `select().eq().in()`. Use `.eq('is_rx_required', false)` then a second `.in('order_id', allOrderIdsSentinel)` only if you scope by order; otherwise adjust the test's chain to `select().eq()` returning the data. Keep test and implementation chains identical.

- [ ] **Step 4: Reconcile the query chain with the test, run to pass**

Pick ONE chain shape and make the implementation and `tests/features/admin/non-rx-queue.test.ts` agree (recommended: `from('order_line_items').select(...).eq('is_rx_required', false)` resolving directly to `{ data }`, and `from('work_orders').select('line_item_id').eq('requires_rx', false).in('line_item_id', ids)`). Update the test's mock chain to match, then:

Run: `npx vitest run tests/features/admin/non-rx-queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the page (server component)**

Create `src/app/admin/non-rx-queue/page.tsx`:

```tsx
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/middleware';
import { redirect } from 'next/navigation';
import { getNonRxQueueItems } from '@/features/admin/lib/non-rx-queue';
import NonRxQueueClient from './client';

export const dynamic = 'force-dynamic';

export default async function NonRxQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/non-rx-queue');

  const supabase = createAdminClient();
  const items = await getNonRxQueueItems(supabase);

  return <NonRxQueueClient items={items} />;
}
```

- [ ] **Step 6: Create the client component**

Create `src/app/admin/non-rx-queue/client.tsx` (mirror the structure/styling of `src/app/admin/rx-queue/client.tsx`; minimal version below):

```tsx
'use client';

import { useState, useTransition } from 'react';
import { generateNonRxWorkOrder } from '@/features/admin/actions/generate-non-rx-work-order';
import type { NonRxQueueItem } from '@/features/admin/lib/non-rx-queue';

export default function NonRxQueueClient({ items }: { items: NonRxQueueItem[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  function release(lineItemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await generateNonRxWorkOrder(lineItemId);
      if (result.success) setDone((d) => new Set(d).add(lineItemId));
      else setError(result.error);
    });
  }

  return (
    <div className="p-6">
      <h1 className="font-sans font-black text-xl uppercase tracking-wider mb-4">Non-Rx Queue</h1>
      {error && <p className="text-red-500 mb-3">{error}</p>}
      {items.length === 0 ? (
        <p className="text-muted-soft">No non-Rx items waiting for release.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.lineItemId} className="flex items-center justify-between border border-white/10 rounded p-3">
              <span>#{it.orderNumber ?? it.orderId.slice(0, 8)} — {it.productTitle} ({it.sku ?? 'no sku'}) → {it.country ?? '?'}</span>
              <button
                disabled={pending || done.has(it.lineItemId)}
                onClick={() => release(it.lineItemId)}
                className="px-3 py-1 bg-accent text-black font-bold rounded disabled:opacity-50"
              >
                {done.has(it.lineItemId) ? 'Released' : 'Release to lab'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add the nav link**

In `src/app/admin/layout.tsx`, after the Rx Queue link (line 32), add:

```tsx
            <Link href="/admin/non-rx-queue" className="text-muted-soft hover:text-white transition">Non-Rx Queue</Link>
```

- [ ] **Step 8: Type-check, lint, build, full suite, commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean; all green (target 384 + the new tests from Tasks 2–6).

```bash
git add src/features/admin/lib/non-rx-queue.ts tests/features/admin/non-rx-queue.test.ts src/app/admin/non-rx-queue/page.tsx src/app/admin/non-rx-queue/client.tsx src/app/admin/layout.tsx
git commit -m "feat(admin): non-Rx release queue (storefront + subscription line items)"
```

---

## Task 7: End-to-end verification + external review

- [ ] **Step 1: Full green check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: `tsc` clean, lint clean, all tests pass (384 baseline + the new non-Rx tests).

- [ ] **Step 2: Migration sanity (when a local/remote Supabase exists)**

When the Supabase project is provisioned (go-live runbook Step 1), run `supabase db reset` (or `supabase db push`) and confirm migrations `00036`–`00038` apply cleanly and existing Rx work orders satisfy `work_orders_rx_image_required`. Until then, this is a SQL review item — the vitest suite does not exercise Postgres constraints.

- [ ] **Step 3: External code review (CLAUDE.md requirement)**

Dispatch a `feature-dev:code-reviewer` (or `pr-review-toolkit:code-reviewer`) subagent over the diff of this branch. Focus areas: the conditional CHECK preserves the Rx invariant; `createShipment`'s `requires_rx` branch never skips a gate for an Rx job; the redemption fork can't strand a membership; `generateNonRxWorkOrder` auth + idempotency. Address findings per `superpowers:receiving-code-review`.

- [ ] **Step 4: Update the audit's deferred-gaps note**

In `docs/audits/2026-06-12-e2e-audit.md` §9, move "Non-Rx (plano) fulfillment path" from **Deferred** to fixed (reference this plan). Commit.

---

## Self-Review (against the spec)

**Spec coverage:**
- §4.1 `requires_rx` + nullable `rx_file_id` + CHECK → Task 1 ✓
- §4.4 partial unique index → Task 1 ✓
- §4.5 `awaiting_fulfillment` enum + committed set (guard + cron) → Task 2 ✓
- §5.1 `generateNonRxWorkOrder` → Task 4 ✓
- §5.2 `createShipment` branch on `requires_rx` (QC + destination retained) → Task 5 ✓
- §5.3 redemption fork at both order-creation sites + `hasRxItems` return → Task 3 ✓
- §5.4 admin non-Rx queue (line-item grain, both sources) + release action + nav → Tasks 4, 6 ✓
- §5.5 account page `awaiting_fulfillment` label → Task 3 ✓
- §6 mixed orders (per-line-item work orders) → falls out of Tasks 4–6; no special-casing ✓
- §8 test list → Tasks 2–6 cover CHECK behavior (app-layer), generator auth/idempotency/advance, ship-gate non-Rx pass + QC/destination blocks, redemption fork, committed guard, queue query ✓
- §9 done criteria → Task 7 ✓

**Placeholder scan:** the only intentional placeholder is the `.in('order_id', [])` in Task 6 Step 3, explicitly flagged with a Step-4 reconciliation instruction to make the query chain and test agree on one shape. No other placeholders.

**Type consistency:** `generateNonRxWorkOrder` returns the same `{ success, workOrderId, workOrderNumber } | { success, error }` shape as `generateWorkOrder`. `createRedemptionFulfillmentOrder` return type (`+ hasRxItems`) is updated in Task 3 Step 3 and consumed in the same task's Steps 7 and 11. `NonRxQueueItem` is defined in Task 6 and consumed by the page/client in the same task. `requires_rx` is added to types in Task 1 and used in Tasks 4–6. `awaiting_fulfillment` is added to the union in Task 2 and used in Tasks 2, 3.
