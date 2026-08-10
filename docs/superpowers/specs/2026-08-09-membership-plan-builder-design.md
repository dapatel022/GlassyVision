# Membership Plan Builder — Design Spec

**Date:** 2026-08-09
**Status:** Approved in-session (founder chose: configure-at-purchase flow, per-pair now/later choice, two pair states, premium surcharge; Approach A; Pair Eyewear used as UX reference — patterns only, no trade dress).
**Supersedes:** the purchase-flow section of `2026-08-04-membership-tiers-purchase-flow-design.md` (buy-then-redeem-only). The redemption pipeline, slot dashboard, and all back-of-house remain the foundation — this spec makes configuration-at-purchase possible; pure pass purchase (zero configured pairs) remains supported and unchanged.
**Builds on:** `2026-08-08-membership-redesign-design.md` (funnel page, math engine — kept; the builder replaces the tier table's direct-checkout CTAs).

## Business goal (drives every decision here)

**2,000 memberships at ≥$100 contribution profit each** (profit = revenue − COGS − payment fees, before ad spend — founder to confirm this definition).

- **COGS working assumption: $25–40 landed per pair** (frame + standard Rx lens + lab + ship + import). Founder is getting an exact lab quote; every number below is re-validated when it lands. **Flagged: at >$40/pair the reprice below is insufficient and tiers must be re-priced again.**
- **Reprice at builder launch (Shopify merchant edit, no code): Solo $109 / Duo $179 / Trio $219.** At $35/pair COGS: Solo ≈ $71, Duo ≈ $104, Trio ≈ $107 contribution before attach. Per-pair story survives: $73/pair (Trio) vs live median frame price (~$118 today).
- **Attach is the profit engine.** The builder exists to move upgrade attach from "maybe later at redemption" into the buying moment. Targets: ≥30% of configured pairs carry a paid lens upgrade; ≥15% choose premium frames. Progressive +$150 (~$25 cost), photochromic +$85 (~$10), tints +$40 (~$5), premium frame +$40 (~$20 incremental) — attach margin is what lifts every tier safely past $100.
- Commercial levers beyond this build live in the appendix.

## Locked flow decisions

1. **Per-pair choice at purchase:** each pair in the plan is independently "configure now" or "decide later" (open slot). Zero configured pairs = today's instant purchase, unchanged.
2. **Two pair states only.** Configured-now → production starts after payment (+Rx upload for Rx pairs). Open slot → redeem anytime in the term. No configured-but-held state (no months-long inventory reservations, no price drift).
3. **Premium frame surcharge.** Standard collection covered flat; premium frames add a visible surcharge at configuration, charged in the same checkout.
4. **Rx after pay.** Configured Rx pairs enter `awaiting_rx` post-payment — existing upload email, day 1/3/7/14/30/60/90 reminders, and the shipment gate (image required, admin review) are untouched. The compliance line does not move.

## 1. Builder UX — `/membership` becomes a 3-step flow

Existing funnel page (hero, savings calculator, comparison, FAQ) is retained; the tier table's CTAs now enter the builder instead of posting straight to checkout.

**Step 1 — Pick your plan.** Tier cards as today (live prices, Duo `MOST CHOSEN` anchor). Selecting a tier opens the builder.

**Step 2 — Your pairs.** One card per pair (`PAIR 01 … 0N`), each: **[Configure this pair]** or **[Decide later — redeem anytime this year]**.

Configure opens a numbered sub-flow (Pair-Eyewear-style mechanics, our instrument-panel skin):
1. **Frame** — catalog picker grid (reuses shop card grid + collection facets). Covered frames show `INCLUDED IN YOUR PLAN`; premium frames a `+$40 PREMIUM` chip (live surcharge price, never hardcoded).
2. **Lenses** — icon-labeled choices. Covered (chip `INCLUDED`): non-Rx plano, blue-light, standard single-vision Rx. Paid (live prices): progressive, photochromic, tints. Default preselected: single-vision, no upgrades. Rx pairs show "you'll upload your prescription after checkout — takes 1 minute."
3. **Done** — pair summary chip collapses onto the pair card (frame thumb + lens line + its add-on subtotal).

**Sticky running total** (mobile bottom bar / desktop rail): `Trio $219 + Progressive $150 + Premium frame $40 = $409`, updating per selection — with the per-pair equivalent line ("$136/pair, all-in") so the math never feels hidden. Honest labels only: descriptive chips (`FOR SCREENS`, `DRIVES LIKE SUNGLASSES`) — **no fabricated "best seller"/review claims** until we have real data.

**Step 3 — Review & checkout.** Order summary listing each pair (or `OPEN SLOT — redeem anytime`), risk-reversal strip repeated at the CTA (prorated refunds · no auto-renew · slots live 12 months + grace), then one Shopify checkout. Builder state is client-side (context + localStorage, same pattern as the cart; abandoned builders survive refresh).

## 2. Cart & checkout model (Shopify remains the only money path)

The checkout POST carries:

- **Membership variant line** (tier). Pair configurations ride as **one line-item attribute per pair**, compact JSON under Shopify's 255-char attribute value limit:
  `_pair_1: {"v":43038182735943,"h":"dusk-wayfarer","l":"sv","u":["progressive"],"t":"none"}`
  (v = frame variant id, h = handle, l = lens type code, u = paid upgrade option ids, t = tint). Same attribute channel that already carries `lensConfig`/`is_rx_required` through checkout to the webhook today.
- **LENSUP-\* add-on lines** for every paid upgrade across configured pairs (existing lens-upgrade-charging machinery).
- **Frame-surcharge lines** for premium pairs — new Shopify product `frame-surcharges` (SKU `SURCH-PREMIUM`, price merchant-owned), created by an idempotent `scripts/setup-frame-surcharges.js` mirroring `setup-lens-addons.js`; per-frame premium flag lives in `product_metadata.subscription_surcharge_variant_id` (column exists, wiring is the pending work).

**Server-side `/checkout` validation (fail closed, 409 like today):** configured pairs ≤ plan `pairs_count`; every paid upgrade in a `_pair_N` attribute has its matching LENSUP line at live price; every premium frame has its surcharge line; frame variant ids exist and are in stock at validation time. Pricing unavailable → 409, never a guessed charge.

## 3. Post-payment — webhook auto-redeem (the one real backend addition)

`provisionMembershipFromOrder` (existing, idempotent on `shopify_order_id`) gains a step after membership + slot creation: parse `_pair_N` attributes; for each configured pair, run the **server-side redemption path** reusing the exact primitives of `startRedemption`: claim slot → `reserve_inventory_unit` RPC → synthesize internal order + line item (Keystone 1, carrying the pair's lens spec) → status `awaiting_rx` (Rx lens types; triggers the existing Rx-upload email + reminder cadence) or `awaiting_fulfillment` (non-Rx; straight to the non-Rx lab queue). Upgrades are already paid in this order — the existing line reconciliation marks them paid; `confirm-addon-payment` is not involved for purchase-time configs.

**Out-of-stock race** (frame sells between checkout and webhook — rare): that pair reverts to an **open slot**; customer gets a "your frame sold out — pick any other" email; any paid upgrade/surcharge tied to the failed pair is written to an admin queue item for manual refund or credit (audit-logged, never silent). Membership itself always provisions.

**Plan shape stays data-driven:** `subscription_plans` (`pairs_count`, `term_months`, `redemption_policy`, `end_of_term_policy`) + `/admin/plans` editor — plan design changes require no code.

## 4. Error handling

| Failure | Behavior |
|---|---|
| Membership/upgrade/surcharge pricing unavailable | Builder disables affected choices, checkout 409s — never a wrong charge |
| Attribute malformed / pairs > plan | `/checkout` 409 with message; nothing reaches Shopify |
| Upgrade line missing or mispriced vs config | 409 (existing reconciliation posture) |
| Frame out of stock at webhook | Pair → open slot + email + admin refund queue item (above) |
| Webhook retry/duplicate | Idempotent on order id; per-pair claims are atomic slot claims (re-run safe) |
| Buyer already has active membership | Existing conflict path unchanged |

## 5. Testing

- **Unit:** pair-attribute encode/parse round-trip (255-char bound proven with worst case: 4 upgrades + longest handle); checkout validation matrix (pairs>plan, missing LENSUP line, mispriced line, premium without surcharge); auto-redeem state selection (`sv`→awaiting_rx, plano→awaiting_fulfillment).
- **Integration:** provisioning fixture with 0/1/N configured pairs; out-of-stock fallback (slot revert + queue item); idempotent re-delivery.
- **E2E (against Bogus Gateway once enabled):** full builder → checkout → webhook → slots + synthesized orders + Rx email.
- Existing 574 tests keep passing; TDD per house rules.

## 6a. Launch checklist addendum — SUB-* shipping (post final-review C1)

A membership genuinely ships glasses (configured pairs are fulfilled through
the same lab as any other order), so SUB-* variants must be
`requires_shipping: true`. Shopify skips the shipping-address step entirely
when no cart line requires shipping — with SUB-* at `false`, `orders/paid`
carried `shipping_address: null` for every configured-pair checkout, and
auto-redeem's destination gate then failed every pair closed 100% of the
time. LENSUP-*/SURCH-* stay `requires_shipping: false` (charge carriers,
never shippable on their own). Before/at launch:

1. Configure a free/zero-cost shipping rate in Shopify for the membership's
   shipping zone(s) FIRST — before flipping `requires_shipping`. **Order
   matters:** re-running `setup-membership.js` (step 2) before this rate
   exists hard-blocks the address/shipping step on every membership
   checkout — including the zero-config purchase that works in production
   today — for the window between the two steps.
2. Re-run `scripts/setup-membership.js` — it now reconciles existing SUB-*
   variants to `requires_shipping: true` (a correctness flag, never a price)
   in addition to its normal create-if-missing behavior.
3. Re-run the Task 13 Step 4.5 E2E check (Bogus Gateway) and confirm
   `orders/paid` carries a real `shipping_address` and configured pairs land
   in `awaiting_rx`/`awaiting_fulfillment` rather than falling back.

## 6. Commercial appendix (levers, not code — sequenced after launch)

Referral give-$20/get-$20 (>$60 net on repriced Duo); single-pair-buyer win-back email ("your next pair could be $73"); paid social only after attach-rate data proves LTV; FSA/HSA eligibility claim **only after** confirming a prepaid eyewear membership qualifies (do not copy Pair's badge blindly); repricing A/B at low traffic before the 2,000 push.

## Out of scope (YAGNI)

Configured-but-held pairs, recurring billing, gifting, toppers/modular hardware, insurance integration, slot-dashboard changes, marketing automation, kids' segmentation.
