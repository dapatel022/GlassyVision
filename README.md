# GlassyVision

Small-batch eyewear, hand-finished in India, shipped to US + Canada.

This repo is the full ops + storefront platform — a **headless Next.js app** at `glassyvision.com` consuming Shopify as a commerce API and Supabase as the operational database. Customers only see Shopify during the ~60-second payment page.

> Authoritative docs: `CLAUDE.md` (operating rules), `docs/superpowers/specs/2026-04-11-glassyvision-phase1-design.md` (architecture spec), `docs/superpowers/plans/*` (week-by-week implementation plans).

## Status (2026-04-23)

Phase 1a code complete through Week 5.

| Milestone | Tag | Scope |
|---|---|---|
| Week 1 — Foundation | (merged) | DB schema + RLS + Supabase clients + Shopify abstraction + webhook HMAC + auth |
| Week 2 — Rx intake + admin | `v0.2.0-week2` | Rx upload wizard, auto-checks, admin review queue, audit log |
| Week 3a — Storefront | `v0.3.0-week3a` | 34-route headless storefront, cart + checkout handoff, thank-you → Rx funnel |
| Week 4 — Lab dashboard | `v0.4.0-week4` | Work-order generation + PDF, 6-column kanban, shipping, inventory, team invites |
| Week 5 — Returns + hardening | `v0.5.0-week5` | Returns flow, drops admin, invite-accept auth, QC photo upload, reconcile cron |

**Remaining (non-code or gated on external inputs):**
- Week 3b — real brand identity, SKU catalog, product photography, counsel-reviewed legal copy
- Week 6 — Vercel deploy + Supabase production + photo shoot + soft launch
- Week 7 — Lighthouse tuning, shop filters, size guide (easier to build against real data)
- Week 8 — analytics (Plausible/PostHog), email templates (Resend), live chat, discount codes
- Week 9 — public launch ops

Compliance blockers owned by the founder: Delaware LLC, FDA establishment registration, payment processor approval, lawyer retainer. See `docs/research/compliance-playbook.md`.

## Architecture

| Concern | Where |
|---|---|
| Every customer pixel (home, shop, PDP, cart, brand, legal, `/rx`, `/track`, `/thanks`) | Next.js 16 App Router |
| Checkout, payments, tax, fraud, refunds | Shopify Basic (headless via Storefront API + Admin API) |
| Ops UI (`/admin/*`, `/lab/*`) | Next.js, role-guarded |
| DB, auth, Rx storage, QC photos | Supabase (Postgres + Auth + Storage) |
| Error monitoring | Sentry (via `src/lib/observability/sentry.ts` stub until `@sentry/nextjs` installed) |
| Hosting | Vercel |

All Shopify calls funnel through `src/lib/commerce/shopify.ts` — one file to replace if we ever swap commerce backends.

## Directory map

```
src/
  app/                      # Next.js App Router
    (site)/                 # public storefront (route group w/ SiteHeader+SiteFooter)
    admin/                  # founder + reviewer dashboards
    lab/                    # lab team kanban + shipping
    api/                    # route handlers (webhooks, signed URLs, cron, PDFs)
    rx/[orderId]/           # token-gated Rx intake
    thanks/[orderId]/       # post-checkout redirect target
    track/[orderId]/        # public order tracking
    returns/start/[orderId]/# token-gated return request
    invite/[token]/         # staff invite accept
  components/site/          # SiteHeader, SiteFooter, NewsletterForm
  context/CartContext.tsx   # cart state + localStorage persistence
  features/
    cart/                   # CartLineItem + types
    shop/                   # ProductCard, gallery, lens picker, add-to-cart
    rx-intake/              # upload wizard, auto-checks, submit action, HMAC tokens
    returns/                # customer return request flow
    admin/                  # rx-queue, returns, drops, inventory, team, work-orders
    lab/                    # kanban board, job modal, shipping queue
    invitations/            # accept-invite form + action
  lib/
    auth/middleware.ts      # role checks + getCurrentUser
    commerce/               # Shopify Storefront + Admin clients + types
    observability/sentry.ts # stub until @sentry/nextjs is installed
    supabase/               # browser, server, admin clients + generated types
supabase/migrations/        # 19 SQL migrations — phase 1a schema
docs/
  research/                 # competitor teardown, compliance playbook, lab workflow
  superpowers/
    specs/                  # approved design specs (brainstorm outputs)
    plans/                  # week-by-week implementation plans
tests/                      # Vitest unit + integration tests
```

## Getting started

### Prerequisites

- Node 20+
- A Supabase project (free tier works for dev)
- (Eventually) a Shopify Basic store + access tokens

### Setup

```bash
npm install
cp .env.example .env.local
# Fill in the required env vars — see below
npm run dev
```

Open http://localhost:3000.

### Required environment variables

**Supabase** (always required):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)

**Rx tokens** (required — HMAC-signed intake URLs):
- `RX_TOKEN_SECRET` — any long random string, keep it secret

**Site** (optional but recommended):
- `NEXT_PUBLIC_SITE_URL` — e.g. `http://localhost:3000` in dev, `https://glassyvision.com` in prod

**Shopify** (required before checkout + catalog work end-to-end):
- `SHOPIFY_STORE_DOMAIN` — e.g. `glassyvision.myshopify.com`
- `SHOPIFY_STOREFRONT_ACCESS_TOKEN`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_WEBHOOK_SECRET` — for HMAC verification of inbound webhooks

**Sentry** (optional — graceful no-op without):
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`

**Cron** (required to protect the reconcile endpoint):
- `CRON_SECRET` — any long random string

### Database

Migrations live in `supabase/migrations/`. Apply them with:

```bash
npx supabase db reset         # local dev
npx supabase db push          # remote production
```

Regenerate TypeScript types after schema changes:

```bash
npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
```

## Scripts

```bash
npm run dev        # dev server with Turbopack on :3000
npm run build      # production build (route table appears in output)
npm run lint       # ESLint — should be 0 errors before commit
npx vitest run     # unit + integration tests (currently 50/50 passing)
```

## Key flows

### Customer journey
1. `/` → `/shop` → `/p/[handle]` → add to cart (cart = localStorage)
2. `/cart` → POST to `/checkout` → Shopify `cartCreate` → redirect to Shopify checkout URL
3. Customer pays on Shopify → returns to `/thanks/[orderId]` (Next.js)
4. If order has Rx items: CTA button → `/rx/[orderId]?token=...`
5. Customer uploads Rx image + optional typed values + certification checkbox
6. Admin reviews at `/admin/rx-queue`, approves or rejects
7. Approval → work order auto-generated → lab kanban at `/lab`
8. Lab moves job through 6 columns (inbox → ready_to_cut → on_edger → on_bench → qc → ship)
9. Shipment recorded at `/lab/shipping`, order marked shipped
10. Customer tracks at `/track/[orderId]?token=...`

### Staff onboarding
1. Founder invites a new staff member at `/admin/team`
2. System generates an invite URL (emailing deferred to Resend integration)
3. Invitee opens `/invite/[token]`, sets a password, creates account
4. New member signs in at `/login`

## Commit + branch conventions

Short summary per commit, `feat:` / `fix:` / `chore:` / `docs:` prefixes. Co-author trailer for Claude:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Work on feature branches (`feature/week-N-topic`) and merge with `--no-ff` to preserve the feature history. Tag milestones as `v0.N.0-weekN`.

## Compliance reminders (non-negotiable)

- **Rx image upload is required.** Never accept typed-only prescriptions.
- **Rx files are PII.** Never commit them, log them, or expose them outside `/admin`, `/lab` behind auth.
- **3-year retention** on Rx files per FTC Eyeglass Rule.
- **US + CA only in Phase 1.** UK is sunglasses-only and blocked until a UK optician is retained.
- **Every Rx must be eyeballed** by an admin before the work order is released.

Details: `docs/research/compliance-playbook.md` + `CLAUDE.md`.
