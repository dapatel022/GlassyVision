# Membership Tiers & Purchase Flow — Design Spec

**Date:** 2026-08-04
**Status:** Strategy approved by founder in-session ("write the subscription spec" after the 3-tier strategy was presented). Builds on the subscription overview spec (prepaid bundle, Approach A, accounts-first) — this spec covers the CUSTOMER-FACING purchase + management surface for MULTIPLE tiers. The back-of-house (provisioning, redemption, surcharges, refund math, end-of-term, inventory reservation) is already built, tested, and audited.

## Product structure

Three prepaid annual tiers. One decision variable: pairs per year. Lens upgrades are **never** baked into tiers — they remain pay-at-redemption surcharges via the existing `confirm-addon-payment` flow.

| Tier | SKU | pairs_count | Positioning | Launch price* |
|---|---|---|---|---|
| Solo | `SUB-1PAIR` | 1 | Entry ("try us") | $89/yr |
| Duo | `SUB-2PAIR` | 2 | **Anchor — "MOST CHOSEN"** | $149/yr |
| Trio | `SUB-3PAIR` | 3 | Best per-pair value | $189/yr |

*Launch prices are script defaults only; prices live in Shopify (rule: never hardcode prices). Per-pair math ($89 / $74 / $63) is computed from live Shopify prices and displayed prominently.

## Shopify representation

One product **"GlassyVision Membership"** (handle `membership`), 3 variants keyed by SKU — exact same pattern as `lens-upgrades`:
- Created by an idempotent `scripts/setup-membership.js` (never overwrites merchant price edits; prints variant ids).
- Untracked inventory, `requires_shipping: false`, published to the headless channel (script prints reminder; publish now automatable via `write_publications`).
- Each variant id is written into the matching `subscription_plans.shopify_variant_id` row (script upserts plan rows for SUB-1PAIR/2PAIR/3PAIR with `pairs_count` 1/2/3, default policies from 00029, `status: active`). `/admin/plans` remains the ops-side editor.

## Purchase flow

1. `/membership` page (below) → "Choose Solo/Duo/Trio" → `POST /checkout` with the membership variant as a normal cart line (no lensConfig; `is_rx_required=false` attribute).
2. Shopify checkout → `orders/paid` webhook → existing `provisionMembershipFromOrder` resolves the plan **by the line item's variant id → subscription_plans row** and creates the membership with that plan's `pairs_count`. (Verify: provisioning currently assumes the single seeded plan — the plan-resolution-by-variant step is the one back-end change this spec requires. Idempotency on `shopify_order_id` unchanged; existing "already has active membership" conflict surfacing unchanged.)
3. Post-purchase: existing account-claim email flow binds the buyer; membership appears in `/account`.

## Customer-facing surfaces (tech-minimal)

### `/membership` — the pricing page
- Hero: "1× / 2× / 3×" oversized mono numerals — the tier choice as an instrument dial. Eyebrow: `ANNUAL MEMBERSHIP · PREPAID · US + CANADA`.
- Three-column spec-sheet table, hairline rules, Duo column accent-bordered with `MOST CHOSEN` chip (mono, like the GV-* taxonomy chips). Each column: pairs numeral, live yearly price, computed per-pair price as the hero number, spec lines (any frame · Rx or plano · upgrades priced at redemption · ships US/CA), CTA "Choose {tier}".
- Fail-closed pricing: page reads live variant prices via Storefront API (same `cache()` pattern as lens-pricing). Pricing unavailable → CTAs disabled with notice; never show a stale/hardcoded price.
- FAQ strip (5 items max): how redemption works, Rx handling, what happens at term end (expire policy + reminders), refunds, upgrade pricing.

### `/account` — slot dashboard
- Membership card: tier name, term dates, status chip (mono: `ACTIVE`, `GRACE`, …).
- Pairs render as **SLOT 01…0N** instrument-panel cards, one per `pairs_count`, each showing its redemption state derived from existing `subscription_redemptions`: `AVAILABLE` (CTA "Redeem this pair" → existing `startRedemption` flow), `AWAITING RX`, `IN PRODUCTION`, `SHIPPED` (tracking link). States reuse the kanban/status vocabulary already in the lab.
- Empty/edge states: no membership → compact pitch linking `/membership`; expired → renewal CTA.

### Navigation
- "Membership" added to site nav (dynamic nav is Shopify-driven; add link entry) + a `plp_grid` banner slot entry promoting it (merchant-editable, not hardcoded).

## Renewal (in scope, minimal)
- No auto-renew (prepaid model). Existing `end-of-term` lib + `membership-expiry` cron already send reminder emails at the seeded `reminder_days` — verify the email template links to `/membership` for a fresh purchase. No new machinery.

## Error handling
| Failure | Behavior |
|---|---|
| Membership variant price unreadable | `/membership` CTAs disabled (fail closed), loud log |
| Buyer already has an active membership | Existing provisioning conflict path (audit_log surface) — additionally show "you already have an active membership" on `/membership` for signed-in members |
| Webhook provisioning fails | Existing webhook retry + parked dead-letter path |
| Plan row missing for purchased SKU | Provisioning refuses loudly (audit_log), never provisions a guessed tier |

## Testing
- Plan resolution by variant id (3 tiers + unknown SKU refusal) — extend provision-membership tests.
- `/membership` pricing math from mocked Storefront prices; fail-closed render.
- Slot state derivation from redemption fixtures (available/awaiting_rx/in_production/shipped, partial redemption).
- Setup script idempotency (mirror setup-lens-addons tests if any; at minimum run-twice-no-op verified manually like lens-upgrades).

## Out of scope (YAGNI)
- Monthly/recurring billing, auto-renew, dunning.
- Gifting, tier upgrades/downgrades mid-term (admin ops cover exceptions).
- Family/shared memberships.
- UK/EU membership sales (US/CA only, same as Rx gate).
