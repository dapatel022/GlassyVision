# Membership Tiers & Purchase Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell three prepaid annual membership tiers (SUB-1PAIR/2PAIR/3PAIR) through a `/membership` pricing page and manage pairs as slot cards in the account, riding the existing provisioning/redemption plumbing.

**Architecture:** Per `docs/superpowers/specs/2026-08-04-membership-tiers-purchase-flow-design.md`. Mirrors the lens-upgrades pattern exactly: one hidden-ish Shopify product `membership` with SKU-keyed variants whose prices are merchant-owned; a `cache()`d Storefront pricing module that fails closed; purchase via the existing `/checkout` route; provisioning already resolves plans by variant id (verified at `provision-membership.ts:52-56`) and only needs plan rows + a loud-refusal guard.

**Tech Stack:** Next.js 16 server components + one small client CTA, Shopify Admin/Storefront APIs, Supabase (`subscription_plans` rows — no migration needed), Vitest.

## Global Constraints

- Prices live in Shopify only; launch defaults ($89/$149/$189) exist solely in the setup script and are never overwritten on re-run.
- Fail closed: unreadable membership prices → `/membership` CTAs disabled + notice; never render stale/hardcoded prices.
- Tiers: Solo `SUB-1PAIR` (1 pair), Duo `SUB-2PAIR` (2, anchor, "MOST CHOSEN"), Trio `SUB-3PAIR` (3).
- Upgrades stay pay-at-redemption; membership lines carry `lensConfig: {lensType:'non_rx',coatings:[],tint:'none'}` so checkout adds no add-ons and `is_rx_required=false`.
- Tech-minimal styling: mono chips, hairline rules, existing tokens (ink/line/accent/base-deeper), `GV-*`-style chips.
- TDD, `npm run lint` before each commit, HEREDOC commits, deploy at the end via cloudbuild + `gcloud run deploy`.

---

### Task 1: Shopify + plan-row bootstrap script

**Files:**
- Create: `scripts/setup-membership.js`

**Interfaces:**
- Produces: Shopify product handle `membership` with variants `SUB-1PAIR`/`SUB-2PAIR`/`SUB-3PAIR`; each variant id upserted into `subscription_plans` (name 'Solo'/'Duo'/'Trio', pairs_count 1/2/3, term 12, default policies, status active); product published to publication `gid://shopify/Publication/157504798791`.

- [ ] **Step 1: Write the script** — CommonJS, `node --env-file=.env.local scripts/setup-membership.js`. Structure copied from `scripts/setup-lens-addons.js` (same idempotency rules) plus:
  - variants: `[{sku:'SUB-1PAIR',title:'Solo — 1 pair / year',price:'89.00'},{sku:'SUB-2PAIR',title:'Duo — 2 pairs / year',price:'149.00'},{sku:'SUB-3PAIR',title:'Trio — 3 pairs / year',price:'189.00'}]`, `requires_shipping:false`, untracked inventory, product title "GlassyVision Membership", handle `membership`, tags `internal-membership`.
  - After ensuring variants: publish product to the headless publication via Admin GraphQL `publishablePublish` (id from REST product → `gid://shopify/Product/${id}`).
  - Plan upsert via `@supabase/supabase-js` `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)`: for each tier, `select id from subscription_plans where shopify_variant_id = <vid>`; if missing, also match by name; insert `{name, pairs_count, term_months:12, billing_mode:'prepaid', shopify_product_id, shopify_variant_id, status:'active'}` or update the matched row's shopify ids. Never touch `redemption_policy`/`end_of_term_policy` on existing rows (DB defaults cover inserts). Print a tier→variant→plan-id table.
  - NOTE: `.env.local` points at LOCAL supabase. Script takes `--db cloud` flag: when set, reads `SUPABASE_URL_CLOUD`/`SUPABASE_SERVICE_ROLE_KEY_CLOUD` env vars; executor fetches cloud values from Secret Manager at run time (`gcloud secrets versions access latest --secret=...`). Run BOTH: local (for dev) and cloud (for prod).
- [ ] **Step 2: Run against dev store + local DB** — expect 3 variants created, published, 3 plan rows printed. Re-run → no-op.
- [ ] **Step 3: Run with cloud DB env** — same output against prod DB.
- [ ] **Step 4: Commit** — `feat(scripts): idempotent membership product + plan bootstrap`.

### Task 2: Live membership pricing module

**Files:**
- Create: `src/lib/commerce/membership-pricing.ts`
- Test: `tests/lib/commerce/membership-pricing.test.ts`

**Interfaces:**
- Produces:
```ts
export const MEMBERSHIP_HANDLE = 'membership';
export interface MembershipTierPrice { sku: string; tier: 'solo'|'duo'|'trio'; pairs: number; variantId: string; price: number; perPair: number; currencyCode: string }
export type MembershipPricing = MembershipTierPrice[] | null; // ordered solo,duo,trio; null = fail closed
export const getMembershipPricing: () => Promise<MembershipPricing>;
```
- SKU map: `SUB-1PAIR→{tier:'solo',pairs:1}`, `SUB-2PAIR→{tier:'duo',pairs:2}`, `SUB-3PAIR→{tier:'trio',pairs:3}`. `perPair = Math.round(price/pairs)`. Missing any of the 3 SKUs → return null (a partial table must not render).

- [ ] **Step 1: Failing tests** — mock `storefrontFetch` exactly like `tests/lib/commerce/lens-pricing.test.ts` (importOriginal spread + vi.resetModules in beforeEach). Cases: (a) all 3 variants → ordered array with perPair 89/75/63 for 89/149/189; (b) product missing → null; (c) only 2 of 3 SKUs → null; (d) fetch throws → null.
- [ ] **Step 2: Implement** — copy `lens-pricing.ts` structure (same GraphQL variants query with handle `membership`, `cache()` wrapper, loud console.error on fail-closed paths).
- [ ] **Step 3: Tests pass → commit** — `feat(commerce): live membership tier pricing (fail-closed)`.

### Task 3: Provisioning — loud refusal for unmatched SUB- SKUs (+ tier tests)

**Files:**
- Modify: `src/features/subscriptions/provision-membership.ts:43-57`
- Test: extend `tests/features/subscriptions/provision-membership.test.ts` (find exact filename via `ls tests/features/subscriptions/ | grep provision`)

**Interfaces:**
- Consumes: existing plan resolution (variant/product match) — unchanged for the happy path.
- Produces: when NO plan matches but some line item's `sku` starts with `SUB-`, insert `audit_log` row `{action:'membership_provision_failed', entity_type:'orders', entity_id:order.id, after_data:{skus:[...]}}` and still return `{provisioned:false}` (webhook retry semantics unchanged — the audit row is the loud part).

- [ ] **Step 1: Failing tests** — (a) order with variant_id matching a pairs_count:2 plan provisions membership with `pairs_total:2` and 2 slots (assert slot insert length); (b) order with line sku `SUB-2PAIR` but no matching plan row → audit_log insert called with action `membership_provision_failed`; (c) non-membership order (no SUB- sku, no plan match) → no audit row (unchanged silence).
- [ ] **Step 2: Implement** — select `sku` alongside variant_id/product_id in the lineItems query; after `if (!plan)`: check skus, insert audit row, return.
- [ ] **Step 3: Full subscriptions suite passes → commit** — `feat(subscriptions): multi-tier provisioning tests + loud unmatched-SKU refusal`.

### Task 4: /membership pricing page + nav

**Files:**
- Create: `src/app/(site)/membership/page.tsx` (server), `src/features/subscriptions/components/MembershipTierTable.tsx` (server), `src/features/subscriptions/components/MembershipCTA.tsx` (client)
- Modify: `src/lib/commerce/menu.ts:10` — add `{ label: 'Membership', href: '/membership' }` to `DEFAULT_NAV_LINKS` (match existing NavLink field names — check the type at the top of menu.ts; use exact existing key names).
- Test: `tests/features/subscriptions/membership-page.test.ts` — unit-test only the pure pieces (no DOM lib): import `MembershipTierTable`'s exported helper `formatTierRow` if extracted, else test via `getMembershipPricing` mocks that the page module's exported `revalidate` is 300. Keep it minimal: the pricing math is already covered in Task 2; page correctness is verified by build + live smoke.

**Interfaces:**
- Consumes: `getMembershipPricing()` (Task 2). `MembershipCTA` posts to `/checkout` with `lines:[{productId:'membership', variantId, productHandle:'membership', title:'GlassyVision Membership — '+tierLabel, image:null, unitPrice:price, quantity:1, lensConfig:{lensType:'non_rx',coatings:[],tint:'none'}}]` and redirects to `checkoutUrl` (same fetch pattern as `CartClient.handleCheckout`).

- [ ] **Step 1: Page** — hero: eyebrow `ANNUAL MEMBERSHIP · PREPAID · US + CANADA` (mono), h1 "One membership. Your year of frames.", oversized `1× / 2× / 3×` mono numerals row. `MembershipTierTable`: 3 columns (grid-cols-1 md:grid-cols-3, gap-px bg-line border border-line like CategoryTiles), each column: mono tier chip (`GV-SOLO` style), pairs numeral (text-6xl font-black), live yearly price, per-pair as hero stat (`$63 / PAIR` mono), 4 spec lines (Any frame in the catalog · Rx or plano lenses · Upgrades priced at redemption · Ships US + Canada), `MembershipCTA` button. Duo column: `ring-1 ring-accent` + `MOST CHOSEN` chip. `pricing === null` → replace CTAs with disabled buttons + amber notice "Membership pricing is temporarily unavailable — please check back shortly."; signed-in member with active membership (fetch via `getCurrentCustomer` + membership query, same reads as account/subscription page) → banner "You already have an active membership" linking `/account/subscription`, CTAs hidden. FAQ: 5 `<details>` items with the spec's topics, mono summaries. `export const revalidate = 300;`
- [ ] **Step 2: Build + lint pass; manual dev-server check** (`npm run dev`, curl localhost /membership renders 3 prices).
- [ ] **Step 3: Commit** — `feat(membership): tier pricing page + nav entry`.

### Task 5: Account slot dashboard

**Files:**
- Modify: `src/app/(site)/account/subscription/page.tsx` (extend — read it fully first; keep every existing data read + auth pattern)
- Create: `src/features/subscriptions/components/SlotCard.tsx` (server) + `src/features/subscriptions/lib/slot-state.ts`
- Test: `tests/features/subscriptions/slot-state.test.ts`

**Interfaces:**
- Produces:
```ts
// slot-state.ts
export type SlotState = 'available' | 'awaiting_rx' | 'in_production' | 'shipped' | 'reserved' | 'expired';
export function deriveSlotState(r: { status: string } | null, membershipStatus: string): SlotState;
```
Mapping: redemption null → membership `active|grace` ? 'available' : 'expired'; redemption.status `awaiting_rx`→'awaiting_rx'; `in_production`→'in_production'; `shipped|delivered`→'shipped'; `reserved|draft|pending_payment`→'reserved'; anything else → 'available' is WRONG — default unknown statuses to 'reserved' (never show a redeemable CTA for an in-flight slot). Check the real `redemption_status` enum values in `supabase/migrations/00029_subscription_core.sql` before finalizing the mapping and mirror them exactly in tests.

- [ ] **Step 1: Failing tests for `deriveSlotState`** — one case per enum value + null/active, null/expired.
- [ ] **Step 2: Implement lib, then SlotCard** — mono `SLOT 01` header, state chip (available=accent, shipped=success, else muted), per-state body: available → "Redeem this pair" link to the existing redemption start URL used on the current subscription page (reuse its exact href); shipped → tracking link if present; others → status line. Grid `gap-px bg-line border border-line`.
- [ ] **Step 3: Wire into account/subscription page** — render one SlotCard per `pairs_total`, pairing slot index to redemptions ordered by created_at. Keep existing page content that isn't superseded.
- [ ] **Step 4: Suite + build pass → commit** — `feat(account): membership slot dashboard`.

### Task 6: Deploy + content + external review

- [ ] **Step 1:** Full gates: `npm run test` (all), `npm run lint`, `npm run build`.
- [ ] **Step 2:** Create `plp_grid` banner metaobject entry promoting membership (Admin API, type `banner`, handle `membership-promo`, title "3 pairs a year from $63/pair", cta `/membership`, active true, order 2).
- [ ] **Step 3:** Deploy (cloudbuild submit + run deploy, background) and smoke: `/membership` 200 + three live prices render; nav shows Membership; buy-flow smoke = POST /checkout with SUB-2PAIR line returns checkoutUrl.
- [ ] **Step 4:** Dispatch `feature-dev:code-reviewer` on the feature commits (scope: `git log --oneline <pre-feature-sha>..HEAD`); fix confirmed findings; final commit + push.

## Deliberately out of scope (per spec)
Monthly billing, auto-renew, gifting, mid-term tier changes, family plans, non-US/CA sales.
