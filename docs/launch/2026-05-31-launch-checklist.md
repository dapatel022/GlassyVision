# GlassyVision — Prioritized Launch Checklist (2026-05-31)

Goal ordering (per founder): **(1) get the app production-ready and tested
end-to-end → (2) close code feature gaps → (3) Shopify store production polish →
(4) business/legal (deprioritized).**

Owner key: **[Claude]** = I can do it in code/config · **[You]** = needs your
action (Shopify admin, accounts, business) · **[Joint]** = I prepare, you provide
secrets/clicks.

Status (updated end of 2026-05-31): hardening **merged to main**; **customer
accounts** (sub-project 0) and **subscription core** (sub-project 1) built +
merged. **241 unit tests green**, 30 migrations apply (`supabase db reset`
clean), compliance + money gates reviewed (multiple security passes). `main` is
**local-only — 47 commits ahead of origin, NOT pushed**; NOT yet deployed; runs
on mock/empty catalog until Shopify is wired.

---

## PRIORITY 1 — App production-ready + true end-to-end test (DO FIRST)

This is "fuel + first drive on a test track." The gating enabler for *real*
end-to-end testing is a Shopify **dev** store — everything else here unblocks it.

### 1A. Land the hardening work — DONE
- [x] **[You/Claude]** Visual eyeball passed (home hero, `/shop` grid, PDP — screenshots clean).
- [x] **[Claude]** Merged `feature/compliance-hardening` → `main` (+ latent compliance fixes: ship-gate Rx expiration, destination market gate).
- [ ] **[You]** Push `main` to origin when ready (`git push origin main` — 47 commits unpushed).

### 1B. Stand up the real backend (production Supabase)
- [ ] **[Joint]** Create a Supabase **cloud** project; I run all 26 migrations + storage buckets + RLS against it.
- [ ] **[Joint]** Run `supabase gen types` against the cloud DB to replace the hand-written `types.ts` (it's currently maintained by hand).
- [ ] **[You]** Confirm Storage buckets (`rx-files` PRIVATE, `qc-photos`, `work-orders`) and their access policies in the cloud project.

### 1C. Shopify DEV store (free Partner dev store) — the end-to-end enabler
- [ ] **[You]** Create a Shopify Partner **dev store**; add 3–4 real-ish products with variants, prices, images, and the metafields the app reads (`custom.is_rx_capable`, `frame_eye_size`, `frame_bridge`, `frame_temple_length`).
- [ ] **[You]** Generate Storefront API + Admin API tokens; give me the values to put in env (or set them yourself).
- [ ] **[You/Joint]** Register webhooks → our endpoint `/api/shopify/webhooks` for `orders/create`, `orders/updated`, **`orders/paid`** (NEW — required for membership provisioning + add-on payment confirmation), `orders/cancelled`, `products/update`, and the GDPR topics **`customers/redact`** + **`shop/redact`** (NEW — drive the account anonymizer). HMAC secret into `SHOPIFY_WEBHOOK_SECRET`.
- [ ] **[You]** Enable Shopify test-mode payments (Bogus Gateway) so checkout completes without real money.

### 1D. Secrets / services
- [ ] **[Joint]** Set all env vars: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `SUPABASE_*`, `RX_TOKEN_SECRET`, **`CLAIM_TOKEN_SECRET`** (NEW — customer-account claim links), `CRON_SECRET`, `RESEND_API_KEY`, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`, **`NEXT_PUBLIC_APP_URL`** (this is the actual var name the code reads — not `NEXT_PUBLIC_SITE_URL`), and **`SUBSCRIPTION_MEMBERSHIP_PRODUCT_ID`** (NEW — see §1.5).
- [ ] **[You]** Resend account + verified sending domain (Rx reminders + shipping emails). [Claude] wire/verify.
- [ ] **[You]** Sentry project → DSN. [Claude] confirm errors report in prod.

### 1E. Deploy to a staging environment
- [ ] **[Joint]** Deploy to Vercel (preview/staging) with the above env; confirm build + cron (`vercel.json`) + instrumentation load.

### 1F. TRUE end-to-end test on staging (the "make it ready" milestone)
- [ ] **[Claude/You]** Real money-path: browse (real products) → cart → Shopify test checkout → return to `/thanks` → webhook lands → order mirrored in Supabase with `awaiting_rx`.
- [ ] **[Claude]** Rx flow against real order: upload → review → approve → work order → lab kanban → QC → **ship → Shopify fulfillment + tracking email**.
- [ ] **[Claude]** Re-run the 41 e2e specs against staging (real Shopify, not mock).
- [ ] **[Claude]** Verify reminder cron fires; reconcile cron pulls real orders; refund path hits Shopify.
- [ ] **[Claude]** Confirm prod safety: mock fallback OFF (empty on Shopify error, not fake), Sentry capturing, RESEND hard-error gone.

---

## PRIORITY 1.5 — Subscription go-live config (code is DONE; these unblock selling subscriptions)

The subscription engine is built + merged (provisioning → redemption → synthesized order → existing lab/ship pipeline; add-on payments; abandon sweeper; dashboard). It stays dormant until these Shopify/config steps are done. Until then add-ons compute as $0.

- [ ] **[You]** Create the **membership product** in Shopify (the "3 pairs / 12 months" offering, priced ~$100–200 — price decision still open). Set its product id into `SUBSCRIPTION_MEMBERSHIP_PRODUCT_ID` env AND update the seeded `subscription_plans` row's `shopify_product_id`/`shopify_variant_id`. Provisioning matches order line items against this.
- [ ] **[You]** Create Shopify products/variants for **lens upgrades** (progressive, blue-light, anti-glare, high-index, photochromic/polarized) → populate `subscription_addon_options.shopify_variant_id` + `price` for each seeded `key`.
- [ ] **[You/Claude]** For **premium frames**: tag frames `product_metadata.subscription_tier='premium'`, create a surcharge variant in Shopify, and set `subscription_surcharge_variant_id` + `subscription_surcharge_price` on those rows. Frames left `included` are fully covered.
- [ ] **[You/Joint]** Register the **`orders/paid`** webhook (above) — without it, memberships never provision and add-on payments never confirm.
- [ ] **[Joint]** Confirm the **sweep-redemptions cron** runs (already in `vercel.json`, `*/15 * * * *`, authed by `CRON_SECRET`) — releases abandoned add-on checkouts.
- [ ] **[Claude/You]** E2E subscription test on staging: buy membership (Shopify test pay) → `orders/paid` provisions membership + 3 slots → log in (magic link) → dashboard shows slots → redeem a covered pair → synthesized order → Rx → lab → ship; then redeem a premium/upgrade pair → add-on checkout → amount-verified confirmation → fulfillment.
- [ ] **[Decision]** Membership **price** and per-pair value; **tax treatment** of a prepaid bundle (accountant); **gating** (open vs invite/drop — currently open).

### Subscription follow-on builds (deferred, separate specs)
- [ ] **Sub-project 2** — refund/dispute webhooks, end-of-term refund/rollover/expire engine, membership cancel/pause/grace + expiry reminders. (Needs your refund/cancellation policy decisions first.)
- [ ] **Admin** — plan-builder UI + multi-plan + membership-management dashboard (one plan is seeded via migration for now).

---

## PRIORITY 2 — Code feature gaps a professional Rx site expects

Decide build-now vs defer for each (most can be post-launch).
- [x] **[DONE]** Customer accounts / login — BUILT (sub-project 0): Supabase Auth magic-link, `customers.auth_user_id`, verified-email account claim, customer RLS, `/account` + `/account/subscription`. (Order history for one-time purchases still deferred.)
- [ ] **[Decision]** Insurance / FSA-HSA support (common for US Rx) — likely defer to post-launch.
- [ ] **[Claude]** Deeper optical validation in auto-checks (PD/sphere/cyl/axis/prism ranges, high-index thresholds, progressive fitting/segment heights) — scope TBD.
- [ ] **[Claude]** Order-confirmation + status emails beyond Rx reminders (confirm Shopify covers, or add).
- [ ] **[Claude]** Accessibility (WCAG) pass + analytics (GA/Plausible) + reviews/social proof (optional).
- [ ] **[Claude]** Resolve documented edge limits if wanted: webhook poison-pill cap, guest-customer email dedupe.

---

## PRIORITY 3 — Shopify store production polish (when going live for real)

- [ ] **[You]** Real production Shopify store (Basic plan) + full catalog from supplier (SKUs, prices, images, metafields, inventory).
- [ ] **[You]** Shipping zones (US/CA), tax registration/config, return policy.
- [ ] **[You]** Live payment processor (decision still open: Razorpay/Cashfree/Stripe/Shopify Payments).
- [ ] **[You]** Checkout branding + custom domain on Shopify; point `glassyvision.com` DNS (Vercel for app, Shopify for checkout).
- [ ] **[Joint]** Re-register production webhooks; flip env to production store; final prod smoke test.

---

## PRIORITY 4 — Business / legal (DEPRIORITIZED — do alongside/after)

- [ ] **[You]** Indian Pvt Ltd incorporation (Delaware C-corp later).
- [ ] **[You]** FDA Class-I import entry process + freight forwarder filings.
- [ ] **[You]** FTC Eyeglass Rule review (largely enforced in-app already) + privacy/terms legal review.
- [ ] **[You]** UK optician retained before any UK Rx (phase 2; UK is sunglasses-only until then).
- [ ] **[You]** Brand identity finalize (logo/colors/voice).

---

## The single critical path to "tested & ready"
1B (prod Supabase) → 1C (Shopify dev store + webhooks) → 1D/1E (secrets + staging deploy) → **1F (true end-to-end test)**. Everything in Priority 1 is the "make it ready" milestone; Priorities 2–4 follow.

**What blocks me right now:** I can do all the code/config, but I need *you* to
create the Supabase cloud project and the Shopify dev store (and hand me tokens,
or set the env yourself) before I can run a real end-to-end test — until then
the app only has mock data to test against.
