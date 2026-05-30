# GlassyVision — Full Application Audit (2026-05-29)

Baseline at audit time: **105/105 unit tests pass**, **10 lint errors** (all in uncommitted new features). 21 migrations. Storefront + admin + lab dashboards present. Substantial uncommitted in-progress work (quiz, virtual try-on, webcam PD, lens advisor, OCR parser, outbound sync).

Severity scale: **CRITICAL** (launch-blocking / legal / data-loss), **HIGH**, **MEDIUM**, **LOW**.

---

## THEME 1 — Compliance perimeter is NOT enforced server-side (most important for this business)

The intended rule — *nothing ships without an admin-approved Rx image; typed/OCR values never reach the lab* — is enforced only in the UI, not on the server. This is the legal core of an Rx eyewear business.

- **[CRITICAL] Lab server actions have ZERO auth checks.** `move-job.ts:10`, `create-shipment.ts:12`, `add-qc-photo.ts:6`, `release-work-order.ts:5` all go straight to `createAdminClient()` (service role, bypasses RLS) with no `getCurrentUser()`/`isLabRole()`. A logged-out actor who knows a `jobId` can mark an order **shipped**. (Contrast `review-rx.ts:25`, which correctly checks `isAdminRole`.)
- **[CRITICAL] `createShipment` never verifies an approved Rx image exists.** `create-shipment.ts:12-56` ships without checking `rx_file_id`, soft-delete state, an `approved` `rx_reviews` row, `released_to_lab_at`, or QC. This is THE compliance line and it is unguarded server-side.
- **[CRITICAL] `moveJob` allows jumping straight to `ship`,** bypassing release-to-lab + QC. `move-job.ts:10-37` accepts any target column; the QC-photo guard only fires when *leaving* `qc`, so an un-released inbox job can move directly to ship.
- **[CRITICAL] Typed/OCR values flow to the lab as authoritative build specs.** `generate-work-order.ts:68-90` builds optical params (`monocular_pd`, `axis`) purely from `typed_*` columns, which are now also auto-filled by the OCR parser. Violates rule 2 ("typed values are double-check only").
- **[CRITICAL] OCR output silently merged into `typed_*` Rx fields with no provenance flag.** `ocr-parser.ts` + `RxUploadStep.tsx:137-141` + `submit-rx.ts:127-136`. Machine-read guesses become the prescription of record. Parser is fragile (bare integers read as powers, `pl/ds` coerced to 0.00 fabricating plano, lost signs).
- **[CRITICAL] No UK / non-US-CA destination block in the fulfillment path.** `submit-rx.ts`, `create-shipment.ts`, `generate-work-order.ts` never re-check shipping country. Violates rule 6.
- **[CRITICAL — DB] `work_orders.rx_file_id` is nullable** (`00006:8`). Schema permits a lab job with no Rx image. The single most important invariant has zero DB enforcement.
- **[CRITICAL — DB] No 3-year retention enforcement for Rx files.** `00004_rx_files.sql` FKs have no `ON DELETE` guard; nothing blocks hard-delete; `sync.ts:268` already DELETEs line items (FK target). FTC Eyeglass Rule territory.
- **[HIGH] `rx-queue` page checks logged-in but not admin role** (`rx-queue/page.tsx:9-10`) — then signs URLs to Rx PII. `/lab/shipping` (`shipping/page.tsx:7-9`) and `qc-upload-url` route (`route.ts:8`) have similar role-check gaps.
- **[HIGH] Unexpired-Rx certification weak.** `submit-rx.ts:53` only validates expiry *if* a date is entered; expiry not required, validated against typed date not image.

## THEME 2 — Commerce integration: idempotency & scale

- **[CRITICAL] Webhook idempotency is check-then-act** (`webhooks/route.ts:21-42`): SELECT-then-INSERT races on Shopify's at-least-once redelivery → duplicate processing, duplicate emails. The unique constraint exists but the 23505 is swallowed.
- **[CRITICAL] No idempotency inside `syncShopifyOrder`** → duplicate customers (`customers.email` is non-unique), lost line items (delete-all-then-insert can interleave). Fix: upserts on unique columns instead of select-then-insert.
- **[HIGH] Zero Shopify rate-limit / 429 / throttle handling, no retry/backoff** anywhere (`shopify-admin.ts`, `shopify-storefront.ts`). First 429 aborts the run.
- **[HIGH] Reconcile cron has no pagination** (`reconcile/route.ts:37`) — drops every order past the first 250. Also sequential O(n) re-sync of every order → Vercel timeout at scale.
- **[HIGH] Failed webhooks return 200** (`webhooks/route.ts:127`) → Shopify never retries; no dead-letter/replay job over `processed_at is null`.
- **[HIGH] Mock-data fallback serves FAKE products in production** (`shopify.ts:88-107`) on any Storefront error — fake prices/variant IDs reach cart. Gate behind non-prod flag.
- **[MEDIUM] Day-0 reminder send happens inside the webhook request path** (`sync.ts:315`), blocking the ack on Resend latency; dedup is race-prone. **[MEDIUM]** `orders/cancelled` hard-deletes in-flight lab jobs (`webhooks/route.ts:82`) and blindly sets `refunded`. **[MEDIUM]** currency coerced to usd/cad; LTV overwritten from payload.

## THEME 3 — Database security & integrity

- **[CRITICAL] Service-role client used on public/customer routes** (`drops`, `waitlist`, `track/[orderId]`, `rx/[orderId]`) — bypasses RLS; a single missing `.eq()` filter leaks all PII. RLS is currently inert (defense-in-depth only).
- **[CRITICAL] `rx_files` RLS enabled but has NO insert/update/delete policy** and SELECT excludes lab roles — policies disagree with real access paths.
- **[LOW→HIGH] Public signup enabled + new users default to `lab_operator`** (`config.toml`, `00001:10`) — `isLabRole()` grants `/lab` access. Anyone who self-signs-up may reach the lab dashboard. Disable public signup (invitation table already exists).
- **[MEDIUM] Missing indexes on many FKs** (rx_reviews.reviewer, work_orders.line_item_id/rx_file_id, returns.*, inventory.*) and on the reminder cadence query (`communications(type, sent_at)`). Postgres does not auto-index FKs.
- **[MEDIUM] `inventory_adjustments` applied via read-modify-write** (`adjust-inventory.ts`) — race → oversell. Use atomic `set qty = qty + delta`.
- **[MEDIUM]** audit_log / webhook_events / communications grow unbounded, may copy Rx/PII into append-only log. **[LOW]** `drops` public-read policy exposes `revenue`/`marketing_notes`; `seed.sql` ships `password123`.

## THEME 4 — Production readiness

- **[CRITICAL] Sentry is installed but NEVER initialized.** No `instrumentation.ts`, no `Sentry.init`, no `withSentryConfig`. All `captureException` calls silently drop. The `error.tsx` "we've been notified" is false. (CLAUDE.md lists Sentry as locked.)
- **[CRITICAL] No image optimization.** Zero `next/image` usage; raw `<img>` everywhere; ~480-566KB demo PNGs on hero/PDP; no `images.remotePatterns`. Hero is LCP — biggest perf regression.
- **[HIGH] Camera stream cleanup leaks** in `VirtualTryOn.tsx:36-68` and `WebcamPdModal.tsx:34-62` — cleanup closes over stale `null` stream; camera light stays on after close (privacy-sensitive, face-pointed). Plus blob URL never revoked (`VirtualTryOn.tsx:184`). These are the lint-flagged setState-in-effect / missing-dep items.
- **[HIGH] PDP has no `generateMetadata`; sitemap omits product URLs + /quiz** — SEO loss on the most commercial pages. No `loading.tsx`, no `robots.ts`, no true `global-error.tsx`.
- **[MEDIUM] Mouse-only drag** in VTO + PD modal → broken on mobile (the primary audience). **[MEDIUM] Marketing copy risk:** "Hand-finished in India & Syracuse" (`page.tsx:30`) contradicts India-only; "Optometrist double-checked" claim (`page.tsx:94`) violates the "don't claim we verify Rx" rule. **[MEDIUM] Fake countdown/stats** (`DropCountdown.tsx`, hardcoded "2,418 Joined") — deceptive-marketing risk for a real drop.
- **GOOD:** Zero "LENSABL" references remain (trademark risk clear).

---

## Recommended sequencing

1. **Compliance & security hardening (launch-blocking).** Theme 1 + the service-role/RLS and signup issues in Theme 3. Enforce the shipment gate, role checks, no-typed-to-lab, retention, and the `rx_file_id NOT NULL` invariant server-side + DB-level. TDD per CLAUDE.md.
2. **Commerce resilience.** Webhook idempotency (upserts + insert-catch-23505), rate-limit/backoff wrapper, reconcile pagination, dead-letter replay, kill prod mock fallback.
3. **Production readiness.** Initialize Sentry, image optimization, fix camera leaks + lint errors, PDP metadata/sitemap, remove risky marketing copy.
4. **Then** resume new-feature work (quiz, VTO, OCR) on a verified-safe base.
