# Week 5: Returns + Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`.

**Goal:** Close the ops loop with a token-gated customer returns flow, admin return queue, drop-management CRUD, invite-accept auth wiring, Sentry, QC photo upload, and a nightly reconciliation cron.

**Architecture notes:** Customer account pages (dashboard at `/account/*`) remain stubs for Week 5 — customer auth needs the Shopify Customer Account API and that's gated on the user configuring Shopify. Returns are handled via email-linked token-gated pages (`/returns/start/[orderId]?token=...`), matching the post-checkout token pattern already used by `/rx/[orderId]` and `/track/[orderId]`.

**Scope (what I can build without user input):**

1. **Returns flow — customer side**
   - `/returns/start/[orderId]?token=...` — token-verified form: line item to return + reason + free-text + photo upload
   - `POST /api/returns/request` — server action creating `returns` row with `status='requested'`
2. **Returns flow — admin side**
   - `/admin/returns/page.tsx` — queue of pending returns
   - `/admin/returns/[id]/page.tsx` — detail with approve/reject actions; approve flips status, writes audit_log, and stubs Shopify refund API call
3. **Drop management**
   - `/admin/drops/page.tsx` — list + "Create drop" form
   - `/admin/drops/[slug]/page.tsx` — edit drop (name, hero copy, schedule, state, linked products)
4. **Invite-accept completion**
   - `/invite/[token]/page.tsx` → add accept form that uses `supabase.auth.admin.createUser` + inserts into `profiles`, marks invitation accepted
5. **Lab QC photo upload**
   - Extend `JobDetailModal` with camera/file input → signed URL upload to `lab-qc/{job_id}/{uuid}.jpg` → append path to `lab_jobs.qc_photos`
6. **Sentry wiring**
   - Install `@sentry/nextjs`, add `sentry.client.config.ts` + `sentry.server.config.ts` with `SENTRY_DSN` from env (graceful no-op if unset)
   - Replace the `console.error` in `error.tsx` with `Sentry.captureException`
7. **Nightly reconciliation cron**
   - `src/app/api/cron/reconcile/route.ts` — scheduled via `vercel.json` cron, pulls Shopify orders from last 24h and upserts into `orders` table (gap-filling for any missed webhooks)
   - Authed via `CRON_SECRET` env
8. **Shop filters (Week 7 pull-forward)**
   - Simple frame_shape + color filter chips on `/shop`

**Out of scope (needs user):**
- Real customer account auth (Shopify Customer Account API)
- Real Shopify refund call (stub only)
- Deploy to Vercel
- Lighthouse optimization pass

## Tasks

- [ ] **T1** Returns customer flow: types + action + page
- [ ] **T2** Admin returns queue + detail + approve/reject
- [ ] **T3** Drop management CRUD admin pages
- [ ] **T4** Invite-accept auth wiring
- [ ] **T5** Lab QC photo upload UI
- [ ] **T6** Sentry install + wiring
- [ ] **T7** Nightly reconciliation cron + vercel.json
- [ ] **T8** Shop filters
- [ ] **T9** Final verify + tag `v0.5.0-week5`
