# GlassyVision — Project Guide for Claude

This file is load-bearing. Read it at the start of every session. Update it when decisions change.

## What we're building

**GlassyVision** — a trendy eyewear e-commerce brand targeting youth and techie audiences. Premium-ish quality frames and prescription lenses.

- **Markets (phase 1):** USA, Canada
- **Markets (phase 2+):** UK (sunglasses-only first, Rx later once a UK-registered optician is retained)
- **Fulfillment:** India — single optical lab operated by the founder's friend (has edging machine + staff)
- **Business entity:** Indian Pvt Ltd first, Delaware C-Corp (or equivalent) later
- **Budget posture:** low. Claude is the sole developer + business advisor. Target tooling cost < $100/month for phase 1.

## Architecture (locked)

**Headless: one Next.js app, Shopify as commerce API black box.** Per `docs/superpowers/specs/2026-04-11-glassyvision-phase1-design.md` §2 (Approach 2 — Headless).

- **Shopify owns money:** checkout, payments, tax, fraud, refunds, financial records. Customer only sees Shopify during the ~60-second payment page detour.
- **Supabase owns operations:** Rx files, review state, work orders, lab jobs, inventory pools, audit logs.
- **Next.js owns every pixel:** home, shop, PDP, cart, brand/editorial pages, `/rx/*`, `/admin/*`, `/lab/*`, `/account/*`. All hosted at `glassyvision.com` on Vercel.

| Concern | Where it lives |
|---|---|
| Storefront UI (home, shop, PDP, cart, brand pages) | **Next.js** at `glassyvision.com` (consumes Shopify Storefront API) |
| Checkout, payments, tax, fraud, refunds | **Shopify Basic** (invoked via `checkoutUrl` redirect) |
| Rx intake, admin review, lab dashboard, account pages | **Next.js app** (this repo) |
| Shopify ↔ us integration | Storefront API (GraphQL) + Admin API + webhooks at `/api/shopify/webhooks/*` |
| DB, auth, Rx file storage | **Supabase** (Postgres + Auth + Storage) |
| Hosting | **Vercel** (Next.js) |
| Error monitoring | **Sentry** |
| Shopify tier | Basic ($39) |

**Customer journey:** browse `glassyvision.com` (Next.js reads catalog via Shopify Storefront API) → cart is client-side state in Next.js → `/checkout` route calls Shopify `cartCreate` → redirect to Shopify `checkoutUrl` → customer pays → returns to `/thanks/[orderId]` (Next.js) → `/rx/[orderId]?token=...` → admin reviews → lab fulfills → ship → Shopify order updated via Admin API.

**Shopify lock-in posture: moderate, by design.** All Shopify calls go through `src/lib/commerce/shopify.ts` — one file to replace if we ever swap commerce backends. All data mirrored into Supabase. No Shopify themes, no Shopify apps, no Shopify scripts.

## Tech stack (this repo)

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Supabase (Postgres + Auth + Storage)
- Sentry for errors
- Vercel for hosting

## The Rx handling rules (compliance-critical)

These rules are not negotiable. We decided them explicitly — see `docs/superpowers/specs/` for rationale.

1. **Rx image upload is REQUIRED** for any prescription order. Customers may also type numbers, but the image is mandatory — not optional.
2. **Never accept typed-only Rx.** If no image, no order. Block at the form level.
3. **Store Rx files for at least 3 years** in Supabase Storage (or equivalent). Retention policy is non-negotiable — this is FTC Eyeglass Rule territory.
4. **Rx files are PII and restricted.** Never commit them, never log their contents, never expose them outside the admin/lab dashboards behind auth.
5. **Manual review queue:** every Rx must be eyeballed by an admin (you or the India team) before the work order is released to the lab.
6. **Do not dispense to UK in phase 1** — UK Opticians Act 1989 requires optician supervision for Rx sales. UK is sunglasses-only until a UK optician is retained.
7. **FTC Eyeglass Rule (US):** seller must have a valid, unexpired Rx on file before dispensing. Add an unexpired-certification checkbox on the intake form.
8. **FDA Class I import entry** applies per shipment to the US. Freight forwarder handles filings; we store records.

## Do's

- **Use the hybrid architecture.** Shopify for commerce, this app for ops. Do not blur the line.
- **Plan before code.** For any non-trivial change, use the `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:executing-plans` flow. Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.
- **Use TDD via `superpowers:test-driven-development`** for any feature with real logic (Rx validation, work-order generation, status transitions).
- **External code review after every feature.** Dispatch a `code-review` or `feature-dev:code-reviewer` subagent after each feature completes. Do not let the generator grade its own work (per Anthropic harness-design article).
- **Use `superpowers:verification-before-completion`** — no "done" claims without running tests and confirming output.
- **Use `context7`** to fetch live docs for Shopify, Next.js, Supabase, Stripe — training data may be stale.
- **Use subagents for independent work** — research, parallel implementation chunks, exploration.
- **Commit often with clear messages.** Use HEREDOC for commit messages.
- **Run lint (`npm run lint`) before every commit.**
- **Keep files small and focused.** If a file grows past ~300 lines, consider splitting.

## Don'ts

- **Don't use the "LENSABL" name.** The existing scaffold copied Lensabl — a real competitor. All references must be stripped before any deploy. Trademark risk.
- **Don't commit Rx images, customer PII, or `.env` files.** `.gitignore` blocks these but double-check before commits.
- **Don't add UK Rx checkout in phase 1.** Sunglasses-only to UK until an optician is retained.
- **Don't accept typed-only prescriptions.** Image upload is required.
- **Don't call doctors or build "we verify your Rx" flows.** User explicitly decided against verification partners.
- **Don't add features beyond the current spec.** No speculative functionality. YAGNI hard.
- **Don't rebuild Shopify's money path.** Checkout (final step), payments, tax calc, fraud, refunds stay on Shopify. Cart state (pre-checkout) lives in Next.js as localStorage + context; we hand it to Shopify via `cartCreate`/`cartLinesAdd` at checkout handoff.
- **Don't use `--no-verify` on commits** unless the user explicitly says so.
- **Don't delete or overwrite uncommitted work** without confirming with the user.
- **Don't skip external code review** after a feature is implemented.
- **Don't hardcode prices.** Pricing lives in Shopify; we receive line items via webhook.
- **Don't expose the `/admin` or `/lab` routes publicly.** Auth required.
- **Don't claim work is done without running tests and showing the output.**

## Workflow discipline (the harness-design pattern)

Based on [Anthropic's harness-design article](https://www.anthropic.com/engineering/harness-design-long-running-apps):

1. **Specialized agents, not solo work.** For non-trivial features, split roles: plan (writing-plans) → generate (me or frontend-design) → evaluate (code-review subagent, fresh context).
2. **Files are the state container.** Specs → plans → implementations. Each session hands off via files, not chat memory.
3. **Sprint contracts.** Before implementing a feature, the plan must list explicit "done" criteria (tests passing, screenshots, verification commands).
4. **Live tool feedback.** Use Playwright (via `frontend-design`) to visually verify UI. Use Sentry for runtime errors. Use Supabase to inspect DB state.
5. **Continuous reassessment.** Review scaffolding every couple of weeks. If a rule, hook, or abstraction isn't earning its keep, kill it.

## Directory map

- `src/app/` — Next.js App Router pages
- `src/components/` — shared components
- `src/features/` — feature-scoped code (to be created: `rx-intake/`, `admin/`, `lab/`)
- `src/context/` — React context providers
- `docs/superpowers/specs/` — approved design specs (brainstorming outputs)
- `docs/superpowers/plans/` — approved implementation plans (writing-plans outputs)
- `docs/research/` — background research from subagents (lab workflow, compliance, competitor teardown)
- `supabase/migrations/` — DB schema migrations (to be created)

## Open decisions (update as they're locked)

- Domain extension (`glassyvision.com` vs `.co` vs other?) — TBD
- Is Indian Pvt Ltd already incorporated? — TBD
- Payment processor choice (Razorpay / Cashfree / Stripe India / Shopify Payments) — TBD
- Brand visual identity (logo, colors, type, voice) — TBD, designing from scratch
- First SKU selection from supplier friend — TBD

## Quick commands

```bash
npm run dev      # local dev server on http://localhost:3000
npm run build    # production build
npm run lint     # eslint (run before every commit)
```
