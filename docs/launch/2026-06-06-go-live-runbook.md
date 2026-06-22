# GlassyVision — Go-Live Runbook (Shopify path)

> **Goal:** take `main` from "code-complete, mock data" to a **real, deployable,
> end-to-end-testable** app on a **free** Shopify dev store + Supabase free tier
> + Vercel. Every value below is verified against the actual code (2026-06-06).
>
> **Owner key:** **[You]** = founder action (account/clicks/secrets) ·
> **[Claude]** = I do it in code/config · **[Joint]** = you provide a secret, I wire it.
>
> **Cost at this stage: ~$0.** Supabase free tier, Shopify **dev store is free**
> (Basic $39/mo only at real launch), Vercel Hobby for testing. Resend + Sentry free tiers.

Do the steps **in order** — each unblocks the next.

---

## Step 0 — Create the free accounts  **[You]**
- **Supabase** — https://supabase.com (GitHub login)
- **Shopify Partners** — https://partners.shopify.com (then create a *development store*)
- **Vercel** — https://vercel.com (connect the `dapatel022/GlassyVision` repo)
- **Resend** — https://resend.com (transactional email)
- **Sentry** — https://sentry.io (error monitoring)

Hand me the project URLs/keys as you go (or set them in Vercel yourself — Step 5).

---

## Step 1 — Supabase cloud project

1. **[You]** Create a new project. **Region:** pick one close to your customers + your Vercel region — for US/CA customers, `us-east-1` (N. Virginia). Save the DB password.
2. **[You]** From **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (secret!) → `SUPABASE_SERVICE_ROLE_KEY`
3. **[Joint]** Apply the **38 migrations** (re-verified 2026-06-22). Easiest path:
   ```bash
   brew install supabase/tap/supabase            # if not installed
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push                              # applies supabase/migrations/* in order
   ```
   This also creates the **5 storage buckets** (migration `00019`): `rx-files`,
   `qc-photos`, `return-photos`, `work-order-pdfs` (all **private**),
   `product-images` (public).
4. **[You]** In **Storage**, confirm `rx-files` is **NOT public** (PII / FTC 3-yr retention).
5. **[Claude]** Regenerate types from the live DB to replace the hand-maintained file:
   ```bash
   supabase gen types typescript --linked > src/lib/supabase/types.ts
   ```
   (I'll run this and commit once the project exists — it removes a drift risk.)

---

## Step 2 — Shopify dev store

1. **[You]** In Shopify Partners → **Stores → Add store → Development store**. Note the domain `your-store.myshopify.com` → `SHOPIFY_STORE_DOMAIN`.
2. **[You]** Add **3–4 products** with variants, prices (USD), and images. For Rx-capable frames, add **metafields** under namespace **`custom`** (Settings → Custom data → Products):
   - `is_rx_capable` (boolean)
   - `frame_eye_size`, `frame_bridge`, `frame_temple_length` (number)
   These exact keys are what the app reads.
3. **[You]** Create a **custom app** (Settings → Apps and sales channels → Develop apps → Create an app):
   - **Admin API access token** → `SHOPIFY_ADMIN_ACCESS_TOKEN`. Scopes: `read_products`, `read_orders`, `write_orders` (refunds), `read_fulfillments`, `write_fulfillments`, `read_inventory`, `write_inventory`, `read_customers`.
   - **Storefront API access token** → `SHOPIFY_STOREFRONT_ACCESS_TOKEN`.
4. **[You]** Get your **Location ID** (Settings → Locations, or Admin API `GET /locations.json`) → `SHOPIFY_LOCATION_ID` (used when creating fulfillments).
5. **[You/Joint]** Register **webhooks** → endpoint `https://<your-app-url>/api/shopify/webhooks`, format JSON. The app handles exactly these **10 topics** (re-verified 2026-06-22):
   `orders/create`, `orders/updated`, `orders/paid`, `refunds/create`,
   `disputes/create`, `orders/cancelled`, `products/update`,
   `customers/data_request`, `customers/redact`, `shop/redact`.
   Put the webhook signing secret → `SHOPIFY_WEBHOOK_SECRET`.
6. **[You]** Enable **test payments** (Settings → Payments → choose "Bogus Gateway" / test mode) so checkout completes with no real money.

---

## Step 3 — Resend + Sentry

1. **[You]** Resend: verify a sending domain, create an API key → `RESEND_API_KEY`; pick a from address → `RESEND_FROM_EMAIL` (e.g. `hello@glassyvision.com`).
2. **[You]** Sentry: create a project (Next.js), copy the DSN → both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.

---

## Step 4 — Generate the app secrets  **[You/Joint]**
Run locally, paste the outputs into the env (Step 5):
```bash
openssl rand -hex 32   # -> RX_TOKEN_SECRET     (signs Rx upload links)
openssl rand -hex 32   # -> CLAIM_TOKEN_SECRET  (signs account-claim links)
openssl rand -hex 32   # -> CRON_SECRET         (Bearer token for /api/cron/*)
```

---

## Step 5 — Full env var list (set in Vercel **and** `.env.local`)

> Verified against `grep process.env` over `src/` — this is the complete set.

| Var | From | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Step 1 | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Step 1 | |
| `SUPABASE_SERVICE_ROLE_KEY` | Step 1 | **secret** — server only |
| `SHOPIFY_STORE_DOMAIN` | Step 2 | `your-store.myshopify.com` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Step 2 | |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Step 2 | **secret** |
| `SHOPIFY_WEBHOOK_SECRET` | Step 2 | **secret** — HMAC verify |
| `SHOPIFY_LOCATION_ID` | Step 2 | fulfillment location |
| `RESEND_API_KEY` | Step 3 | **secret** |
| `RESEND_FROM_EMAIL` | Step 3 | |
| `SENTRY_DSN` | Step 3 | |
| `NEXT_PUBLIC_SENTRY_DSN` | Step 3 | |
| `RX_TOKEN_SECRET` | Step 4 | **secret** |
| `CLAIM_TOKEN_SECRET` | Step 4 | **secret** |
| `CRON_SECRET` | Step 4 | **secret** |
| `NEXT_PUBLIC_BASE_URL` | Step 5 | your deployed URL, e.g. `https://glassyvision.vercel.app` (no trailing slash) |

> There is **no** `SUBSCRIPTION_MEMBERSHIP_PRODUCT_ID` env var — the membership
> product is linked in the **DB** (Step 6), not via env.

---

## Step 6 — Deploy to Vercel  **[Joint]**
1. **[You]** Import the repo in Vercel; add all Step-5 env vars (Production + Preview).
2. **[Claude/You]** Deploy. The **4 crons** auto-register from `vercel.json`:
   `reconcile` (5:00 UTC), `rx-reminder` (9:00 UTC), `sweep-redemptions` (every 15 min), `membership-expiry` (6:00 UTC) — all authed by `CRON_SECRET`.
3. **[You]** Set `NEXT_PUBLIC_BASE_URL` to the real deployed URL and redeploy, then go back to Step 2.5 and point the **webhooks** at `https://<that-url>/api/shopify/webhooks`.

---

## Step 7 — Wire the subscription product (only needed to sell memberships)  **[You/Claude]**
The subscription engine stays dormant until this is done (add-ons compute as $0 until then).
1. **[You]** Create the **membership product** in Shopify (the "3 pairs / 12 months" offer).
2. **[Claude/You]** In **`/admin/plans`** (the plan-builder we just shipped), edit the seeded plan → set its **Shopify product id + variant id** to the membership product. (Provisioning matches `orders/paid` line items against this.)
3. **[You]** Create Shopify variants for **lens upgrades** + **premium-frame surcharges**; populate `subscription_addon_options` and the premium `product_metadata` surcharge fields. (I can script the DB side once the variant ids exist.)

---

## Step 8 — TRUE end-to-end test (the "ready" milestone)  **[Claude/You]**
On the deployed staging URL:
1. Browse a real product → cart → **Shopify test checkout** → return to `/thanks/[orderId]` → confirm the `orders/create`/`orders/paid` webhook lands and the order mirrors into Supabase as `awaiting_rx`.
2. Upload Rx → admin approves in `/admin/rx-queue` → work order → lab kanban → QC → **ship** → confirm Shopify fulfillment + tracking email (Resend).
3. **Subscription:** buy the membership (test pay) → `orders/paid` provisions membership + 3 slots → magic-link login → `/account/subscription` shows slots → redeem a covered pair (→ synthesized order → Rx → lab → ship) → redeem a premium/upgrade pair (→ add-on checkout → amount-verified confirmation → fulfillment).
4. **Money-safety:** issue a Shopify-side refund on a membership order → confirm `refunds/create` expires the unredeemed slots; issue a partial-then-cancel via `/admin/memberships/[id]` → confirm pro-rata refund.
5. Confirm Sentry captures a deliberately-triggered error; confirm crons run (check logs).

---

## What blocks me right now
I can do **every [Claude] step** the moment the accounts exist. I'm blocked on
**Step 1 (create the Supabase project)** and **Step 2 (create the Shopify dev
store + tokens)** — those need your login. Do those two, hand me the keys (or set
them in Vercel), and I'll run migrations, regen types, wire webhooks, and drive
the Step-8 end-to-end test.
