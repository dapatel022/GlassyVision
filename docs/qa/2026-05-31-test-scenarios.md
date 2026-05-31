# GlassyVision — Full QA Test Scenarios (2026-05-31)

Manual + exploratory test matrix covering every persona and edge. Pairs with the
151 automated unit tests (which cover the server-side gates, webhook idempotency,
backoff, reminder cadence, etc.). Items marked **[AUTO]** already have unit
coverage; the rest are manual/exploratory.

Legend: ✅ happy path · ⚠️ edge case · 🔴 negative/security (must fail correctly)

Notes on terminology:
- **Seller = the GlassyVision merchant** (single seller; Shopify is the commerce
  backend). There is no marketplace/3rd-party seller.
- **Demo-level features** (quiz, virtual try-on, lens advisor, webcam PD) work but
  are not wired to real inventory/measurements — QA their UX, not data accuracy.
- Many commerce flows require **Shopify env vars** (`SHOPIFY_STORE_DOMAIN`,
  `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`,
  `SHOPIFY_WEBHOOK_SECRET`). Without them the app uses mock data (dev) / empty
  catalog (prod) and the webhook/reconcile paths stub out.

---

## 1. BUYER / SHOPPER (storefront — no account needed pre-purchase)

### Browsing & discovery
- ✅ Home renders: hero showcase rotates/fades on color-dot click; ticker; drop panel.
- ✅ Shop grid lists products; product cards show price, RX-capable badge, hover-zoom.
- ✅ PDP loads by handle; gallery main image + thumbnails switch on click.
- ✅ Editorial pages: lookbook, story, made-in-india, faq, contact, rx-disclaimer, privacy, terms.
- ✅ Drops list + drop detail.
- ⚠️ PDP for a non-existent handle → 404 (notFound).
- ⚠️ Product with no images → "No image" placeholder (card) / "No images yet" (gallery).
- ⚠️ Empty catalog in **prod** (Shopify error) → empty grid, NOT fake mock products. **[AUTO]**
- ⚠️ Mock catalog in **dev** when Shopify unconfigured. **[AUTO]**
- ⚠️ Mobile/responsive: hero, grid, PDP at 375px width.
- ⚠️ LCP: hero + PDP main image are `priority` `next/image`; confirm optimized `/_next/image` srcs and reasonable load.

### Quiz → shop filtering
- ✅ Complete quiz (shape/size/style/intent) → redirects to `/shop?shape=…&size=…&style=…&sun=…&quiz=true`.
- ✅ Shop applies filters; results narrow correctly. **[AUTO: shop-filtering]**
- ⚠️ Filter value `any` → no filtering on that dimension.
- ⚠️ Direct `/shop?shape=round` (no quiz) still filters.
- ⚠️ Filters that match nothing → empty state (not error).

### Configurator & interactive tools (demo-level)
- ✅ PDP configurator: pick lens type / material / tint / coatings; price/labels update.
- ✅ Lens Advisor: change SPH power → recommended index updates (1.50 → 1.67 → 1.74).
- ✅ Virtual Try-On opens via "Try-On Live": preset faces, upload own photo, drag/scale/rotate overlay; frame SVG matches product.
- ✅ Webcam PD tool: card calibration → pupil alignment → computes PD → "Apply".
- ⚠️ **VTO camera**: grant camera → live video; **deny camera → falls back to preset mode** (no crash).
- 🔴 **VTO camera leak**: open camera VTO, close modal / switch to preset → **webcam indicator light turns OFF** (stream stopped). Repeat several times.
- 🔴 **Webcam PD leak**: open PD tool, close → camera light OFF.
- ⚠️ **Mobile touch**: on a phone, drag the VTO frame overlay and the PD card/pupil handles with a finger — should move and **not scroll the page** (touch-none). [Use `http://<lan-ip>:3000`.]
- ⚠️ VTO uploaded-photo object URL revoked (no memory growth across many uploads).

### Cart & checkout handoff
- ✅ Add to cart from PDP; cart badge updates; cart page lists lines.
- ✅ Update quantity, remove line; totals recompute.
- ✅ Cart persists across reload (localStorage) and across pages.
- ✅ Checkout → `cartCreate` → redirect to Shopify `checkoutUrl`.
- ✅ After payment → return to `/thanks/[orderId]` → link to `/rx/[orderId]`.
- ⚠️ Empty cart → checkout disabled / friendly state.
- 🔴 Cart line with a stale/invalid variant id (catalog changed) → checkout surfaces a clear error, not a silent fail.
- ⚠️ Currency: US order shows USD, CA order shows CAD.

### Waitlist / newsletter
- ✅ Join a drop waitlist (email [+ phone]) → success state.
- ✅ Newsletter subscribe.
- ⚠️ Duplicate waitlist signup → graceful (no crash / no dupe error to user).
- 🔴 Invalid email format → validation error.

---

## 2. PRESCRIPTION (Rx intake & lifecycle) — COMPLIANCE CRITICAL

### Access control to the Rx page
- ✅ `/rx/[orderId]?token=…&exp=…` with a valid HMAC token+exp opens the wizard. **[AUTO: rx-token]**
- 🔴 Expired `exp` → access denied.
- 🔴 Tampered/missing token → access denied. **[AUTO: hmac]**
- 🔴 Token for order A used on order B → denied.

### Intake wizard
- ✅ Single Rx item → straight to upload.
- ✅ Multi-item order → assignment step: "same Rx for all" vs "per-item".
- ✅ Per-item mode loops through each line item.

### Upload step
- ✅ Upload JPEG / PNG / HEIC image → preview, progress, success.
- ✅ Upload PDF prescription → accepted (skips image-dimension check).
- 🔴 File > 10 MB → rejected with size error.
- 🔴 Unsupported type (e.g. .txt, .docx) → rejected.
- ⚠️ Very low-resolution image → resolution warning/error path.
- ⚠️ Corrupt/zero-byte file → handled gracefully.
- ✅ Upload URL is HMAC-token-scoped (upload-url route). **[AUTO]**

### OCR (assist, not authoritative)
- ✅ Image with a clear Rx → OCR prefills typed values; typed-values step shows the **amber "auto-filled — please verify"** banner.
- ✅ OCR success → on submit, `typed_values_source = 'ocr'` stored. **[AUTO: submit-rx]**
- ⚠️ OCR fails / times out → no crash; customer enters values manually; source = `manual` or `null`.
- ⚠️ Non-Rx photo → OCR returns garbage/empty; customer must correct (banner prompts verification).
- ⚠️ Customer edits OCR-prefilled values → still flagged `ocr` (admin verifies vs image).

### Typed values & certification
- ✅ Valid typed values submit. ⚠️ Empty values → warnings (not blocking). **[AUTO: auto-checks]**
- 🔴 Expiration date in the past → error. ✅ Future date OK. ⚠️ No date entered → allowed.
- 🔴 Certification checkbox unchecked → submit blocked. **[AUTO: submit-rx]**
- ✅ Skip typed values entirely (image-only) → source `null`, submit succeeds.

### Skip-at-intake & reminders (policy: no auto-cancel)
- ✅ Skip upload at intake → order sits `awaiting_rx`; confirmation that link was emailed.
- ✅ Reminder cadence fires day **1/3/7/14/30/60/90**. **[AUTO: rx-reminder select-next + cron]**
- ⚠️ Reminder idempotency: cron run twice same day → no duplicate email. **[AUTO]**
- ⚠️ Day-0 reminder on order create (webhook) → one send only. **[AUTO via sync]**
- ✅ Order never auto-cancels; aging order surfaces on admin dashboard.

### Re-upload after rejection
- ✅ Rejected Rx → customer revisits `/rx/[orderId]` → sees rejection reason → uploads a clearer photo.
- ⚠️ Multiple sequential uploads for the same order/line item.

---

## 3. ADMIN (review + operations)

### Auth & route protection
- ✅ Founder/reviewer log in → `/admin/*` accessible.
- 🔴 Lab-role user hits `/admin` → redirected to `/unauthorized`.
- 🔴 `pending`/unauthenticated → redirected to `/login`.
- 🔴 Logged-in non-admin calling `reviewRx` server action → **Forbidden**. **[AUTO]**

### Rx review queue
- ✅ Queue lists unreviewed, non-deleted Rx files oldest-first; order numbers resolved.
- ✅ Open item → signed image URL renders; typed values shown; auto-check warnings; **"OCR-assisted · verify vs image" badge** when source = ocr.
- ✅ Approve → `rx_reviews` row + audit_log + `rx_status=approved` + **work order & lab job generated**. **[AUTO]**
- ✅ Reject (reason) → rx file **soft-deleted** (`deleted_at`), `rx_status=rejected`, audit row. **[AUTO]**
- 🔴 Approve a typed-only / image-less record → blocked (generateWorkOrder refuses missing/deleted image). **[AUTO]**
- ⚠️ Approved-then-superseded review ordering: latest review by `reviewed_at` wins (not array order). **[AUTO]**
- ⚠️ Signed URL expiry (1h) → re-open regenerates.
- ⚠️ Supabase error during review → surfaced loudly, not swallowed (per the error-surfacing fix).

### Work orders & dashboard
- ✅ Release work order to lab (admin only) → `released_to_lab_at` set, lab job → `ready_to_cut`. **[AUTO]**
- 🔴 Lab operator calling `releaseWorkOrder` → Forbidden. **[AUTO]**
- 🔴 Release re-validates Rx: refuses if not approved / image missing/deleted. **[AUTO]**
- ✅ Work-order PDF renders prescription + frame specs for the lab.
- 🔴 Work-order PDF route requires admin/lab auth (401 anon, 403 pending). **[AUTO]**
- ✅ Dashboard awaiting-Rx aging tiles reflect day buckets; triage page lists stalled orders.

### Returns, drops, team, inventory
- ✅ Returns queue: approve refund → Shopify `createRefund`; reject; view detail.
- ✅ Drops: create / edit / list.
- ✅ Team: invite a user with a role → invite email/link.
- ✅ Accept invite → profile **upserted** to the invited role (coexists with the auto-create trigger). **[AUTO]**
- 🔴 Accept an expired / already-used / unknown invite → clear error.
- ✅ Inventory adjust (atomic increment) and push-to-Shopify.
- ⚠️ Concurrent inventory adjustments don't lose updates.

---

## 4. LAB (fulfillment) — COMPLIANCE CRITICAL

### Auth & route protection
- ✅ Lab roles (lab_admin/operator/qc/shipping) + founder → `/lab/*` accessible.
- 🔴 Reviewer (admin-only) calling a **lab** action (move/ship/qc) → Forbidden (lab role required). **[AUTO]**
- 🔴 Unauthenticated calling `moveJob`/`createShipment`/`addQcPhoto` → Forbidden, **DB untouched**. **[AUTO]**

### Kanban & QC
- ✅ Jobs shown by column (inbox → ready_to_cut → on_edger → on_bench → qc → ship).
- ✅ Move job between columns; `started_at` set on first move out of inbox.
- 🔴 Leave `qc` with zero QC photos → blocked. **[AUTO]**
- 🔴 Jump straight to `ship` without release + QC photos → blocked. **[AUTO]**
- ✅ Upload QC photo via `qc-upload-url` route. 🔴 Non-lab caller → 403. **[AUTO]**

### Shipment gate (THE compliance line)
- ✅ Fully compliant job (approved+non-deleted image, released, QC photos, US/CA) → shipment created, order `shipped`. **[AUTO]**
- 🔴 No Rx file on the work order → blocked. **[AUTO]**
- 🔴 Rx image soft-deleted → blocked. **[AUTO]**
- 🔴 Rx never approved → blocked. **[AUTO]**
- 🔴 Work order never released → blocked. **[AUTO]**
- 🔴 No QC photos → blocked. **[AUTO]**
- 🔴 **Non-US/CA destination (e.g. UK)** → blocked (phase-1 rule). **[AUTO]**
- ⚠️ Country stored uppercase (`US`) still ships (case-insensitive). **[AUTO]**

### Shopify fulfillment push
- ✅ On ship, Shopify fulfillment created (tracking + **only this work order's line item**). **[AUTO]**
- ⚠️ Multi-item order partial ship → only the shipped line item is fulfilled in Shopify, not the whole order. **[AUTO]**
- ⚠️ Shopify env not configured → no push, local shipment still recorded. **[AUTO]**
- ⚠️ Shopify fulfillment API fails → **local shipment still succeeds**, error logged. **[AUTO]**

---

## 5. SELLER / COMMERCE-OPS (Shopify integration)

### Webhooks (`/api/shopify/webhooks`)
- 🔴 Invalid HMAC signature → 401. **[AUTO]**
- 🔴 Malformed JSON body → 400.
- ✅ `orders/create` → order + customer synced, line items, `rx_status=awaiting_upload` for Rx items, day-0 reminder. **[AUTO]**
- ✅ **Idempotency**: duplicate event id (already processed) → skipped 200. **[AUTO]**
- ⚠️ Redelivery of a previously-**failed** event → reprocessed. **[AUTO]**
- ⚠️ Handler failure → **HTTP 500** so Shopify retries; row left as dead-letter. **[AUTO]**
- ✅ `orders/updated`, `orders/cancelled` (cancel handling), `products/update` (metadata upsert).
- ⚠️ Concurrent same-event deliveries → unique constraint prevents dupe rows (known narrow reprocess race documented).

### Order sync internals
- ✅ Customer **dedupe** via upsert on `shopify_customer_id`. **[AUTO]**
- ⚠️ Guest checkout (no customer id) → best-effort email dedupe (documented limitation).
- ⚠️ Currency mapping (usd/cad); missing optional fields default safely.
- ⚠️ Line items refreshed (delete-then-insert) per sync.

### Reconcile cron (`/api/cron/reconcile`)
- 🔴 Missing/wrong `CRON_SECRET` → 401. **[AUTO]**
- ⚠️ No Shopify env → stubbed response. **[AUTO]**
- ✅ Scans `updated_at_min` window; fills gaps; **paginates across all pages** (cursor). **[AUTO]**
- ✅ `gapFilledCount` counts only orders that actually synced. **[AUTO]**
- ⚠️ Large order volume → respects MAX_PAGES, logs if truncated.

### Rate limiting / resilience
- ⚠️ Shopify 429 → retried with backoff (Retry-After honored). **[AUTO: fetch-with-retry]**
- ⚠️ Shopify 5xx → retried; non-429 4xx → not retried. **[AUTO]**
- ⚠️ Mock fallback gated to non-prod. **[AUTO]**

### Refunds & inventory push
- ✅ Approve refund in returns → Shopify `createRefund` with amount/currency.
- 🔴 Shopify refund API error → surfaced, return not marked refunded falsely.
- ✅ `pushInventoryToShopify` sets levels at the resolved location.

---

## 6. COMPLIANCE / SECURITY (cross-cutting — must all hold)

- 🔴 **Nothing ships without an admin-approved, non-deleted Rx image** — verified at createShipment, moveJob(→ship), generateWorkOrder, releaseWorkOrder. **[AUTO]**
- 🔴 **Typed-only Rx never reaches the lab** (image required for work order). **[AUTO]**
- 🔴 **3-year retention**: attempt a hard `DELETE` on `rx_files` → DB trigger raises exception; only soft-delete allowed.
- 🔴 **UK / non-US-CA dispensing blocked** in the fulfillment path. **[AUTO]**
- 🔴 **FTC**: unexpired-Rx certification enforced on intake.
- 🔴 **Rx PII never exposed**: PDF staff-only; review images via short-lived signed URLs; no Rx contents in logs; RLS deny-by-default.
- 🔴 **Public signup disabled**; new accounts default to zero-access `pending` (no `/lab` or `/admin`). **[AUTO via middleware/migration]**
- 🔴 **Privilege escalation**: every `/admin`/`/lab` server action + API route re-checks auth+role server-side (service-role client bypasses RLS).
- 🔴 **Direct API / UUID-guessing**: hitting `/api/work-orders/<guessed-uuid>/pdf` or lab actions without a session → 401/403. **[AUTO]**
- 🔴 **DB-level invariant**: `work_orders.rx_file_id NOT NULL` rejects an image-less work order at the schema layer. **[verified via db reset]**
- ⚠️ RLS policies present on all tables (defense in depth; app uses service role).

---

## 7. INFRA / OBSERVABILITY / RELEASE READINESS

- ⚠️ **Sentry**: with a DSN in **production**, a thrown error reports; in **dev** (or no DSN) it does NOT init (no PII, `sendDefaultPii:false`). **[verified gating]**
- ✅ `error.tsx` (segment) and `global-error.tsx` (root) render; "we've been notified" is now truthful with a DSN.
- ⚠️ **Email**: production **hard-errors** if `RESEND_API_KEY` missing; dev logs a fallback. **[AUTO]**
- ✅ **SEO**: PDP `generateMetadata` (title/OG/desc); `robots.txt` disallows /admin /lab /api /rx /account /thanks /track /checkout; `sitemap.xml` includes product URLs + /quiz. **[verified 200]**
- ✅ **Images**: `next/image` optimization serves (`/_next/image…` → 200). **[verified]**
- ✅ **Build**: `npm run build` compiles; **migrations + seed** apply via `supabase db reset`. **[verified]**
- ⚠️ Env-var matrix: app behaves safely with each of SHOPIFY_*, RESEND_API_KEY, SENTRY_DSN, CRON_SECRET present/absent.
- ⚠️ Performance: hero/PDP LCP, no layout shift after image migration.

---

## Known limitations to QA against (by design, documented)
- Concurrent redelivery of a *previously-failed* webhook can double-run the handler (single-store scale; line-items are delete-then-insert).
- Deterministically-bad webhook payloads retry to Shopify's cap; the unprocessed `webhook_events` row is the dead-letter record (no auto poison-pill yet).
- Guest-checkout customers (no Shopify customer id) use best-effort email dedupe.
- Quiz / VTO / lens advisor / webcam PD are demo-level UX, not wired to real measurement/inventory data.
