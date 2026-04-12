# GlassyVision — Phase 1 Design Specification

**Date:** 2026-04-11
**Status:** Approved (pending written-spec review)
**Scope:** Phase 1a (infrastructure, weeks 1–5) + Phase 1b (launch polish, weeks 6–9)
**Target live date:** Early-to-mid June 2026

---

## 1. Product vision

**GlassyVision** is a drop-culture eyewear brand targeting youth and techie audiences, selling sunglasses, Rx sunglasses, and prescription eyewear online. Orders ship from a small optical lab in India operated by the founder's friend (4–6 staff, English-speaking, reliable wifi, own machinery). Business entity is Indian Pvt Ltd first, Delaware LLC second.

**Markets (phase 1):** USA + Canada only.
**Markets (phase 2+):** UK (sunglasses-only first, Rx later with UK-registered optician).

**Brand direction:** Bold Editorial Cool — cool off-white `#f2f5f8` base, cobalt `#1a3a8a` accent, near-black `#0a0a0a` ink, tortoise `#c9b77a` warmth. Typography: Inter Tight (display), Fraunces (editorial italic), JetBrains Mono (metadata). Frame naming follows Indian cities (Bombay, Jaipur, Kochi, Udaipur, etc.).

**Drop model:** capsule collections of 6–10 frames, released on a 4–6 week cadence. Each drop has a name, number, start/end date, hero content, countdown, and a waitlist for the next drop. This is the #1 competitive gap in the eyewear market for this positioning (per competitor teardown research).

**Budget posture:** ~$850/month fixed ops cost (Shopify $39, FDA amortized ~$775, tooling ~$30) + ~$3k one-time legal. Claude is the sole developer + business advisor.

---

## 2. System architecture

### The rule

- **Shopify owns money** — checkout, payment processing, tax calculation, fraud detection, refunds, financial records.
- **Supabase owns operations** — Rx files, review state, work orders, lab jobs, inventory pools, audit logs, internal notes.
- **Next.js owns every pixel** — the customer and team see our UI everywhere except the 60-second Shopify checkout detour.

### Architecture: Approach 2 — Headless

One Next.js 16 app deployed to Vercel at `glassyvision.com`. Shopify runs headlessly as a commerce API black box via Storefront API (read catalog, manage cart, generate checkout URL) and Admin API (write inventory, fulfillments, refunds). Customer never sees Shopify branding except on the payment page.

### Backing services

| Service | Role | Monthly cost |
|---|---|---|
| **Supabase** | Postgres DB, Auth (roles), Storage (Rx files, QC photos), Realtime (lab kanban) | $0 free tier → $25 later |
| **Shopify Basic** | Storefront API, Admin API, webhooks, checkout, payments, tax, fraud, refunds | $39 + 2.9% + $0.30/txn |
| **Resend** | Transactional email (Rx reminders, status updates, drop launches) | $0 free tier → $20 later |
| **Sentry** | Error monitoring, Next.js SDK, release tracking | $0 free tier |
| **Vercel** | Hosting, edge network, CI/CD | $0 free tier → $20 later |

### Tech stack

- Next.js 16 (App Router, Server Components)
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase JS SDK (`@supabase/supabase-js`)
- Shopify Storefront API (GraphQL) + Admin API (REST/GraphQL)
- Resend (`resend` npm + React Email templates)
- Sentry (`@sentry/nextjs`)
- Vitest (unit + integration tests)
- Playwright (E2E tests)

### Shopify lock-in posture: moderate, by design

All Shopify calls go through `lib/commerce/shopify.ts` — one file to replace if we ever swap to Medusa/Stripe. All data mirrored into Supabase so we own our data. No Shopify themes, no Shopify apps, no Shopify scripts. Estimated migration cost if we leave Shopify: ~6–8 weeks of engineering.

---

## 3. Data model (Supabase schema)

### Phase 1a tables (20 — migrated weeks 1–2)

**`profiles`** — extends Supabase Auth users
- id (uuid, fk → auth.users), email, full_name, role (founder | reviewer | lab_admin | lab_operator | lab_qc | lab_shipping), avatar_url, last_active_at, invitation_id, timezone, preferred_notification_channels_json, created_at, updated_at

**`customers`** — minimal mirror for ops + GDPR
- id (uuid), shopify_customer_id (unique), email, first_name, last_name, lifetime_value, total_orders, first_order_at, last_order_at, vip_tier (none | returning | vip), internal_notes, flags_json, deletion_requested_at, created_at, updated_at

**`orders`** — mirror of Shopify orders (ops-relevant fields only)
- id (uuid), shopify_order_id (int, unique), shopify_order_number (text), customer_id (fk), customer_email, customer_name, shipping_address_json, billing_country (us | ca), currency (usd | cad), subtotal, total, tax, shipping_cost, discount_code_used, financial_status, fulfillment_status, has_rx_items (bool), rx_status (none | awaiting_upload | uploaded_pending_review | approved | rejected), drop_id (fk, nullable), utm_source, utm_medium, utm_campaign, first_order_ever (bool), notes_internal, created_at, updated_at

**`order_line_items`** — normalized line items
- id (uuid), order_id (fk), shopify_line_item_id (int), product_id, variant_id, product_handle, product_title, variant_title, sku, quantity, unit_price, line_total, is_rx_required (bool), frame_shape, frame_color, frame_size

**`rx_files`** — prescription uploads (PII, 3-year retention)
- id (uuid), order_id (fk), line_item_id (fk, nullable), customer_email, storage_path, original_filename, file_size, mime_type, typed_od_sphere, typed_od_cylinder, typed_od_axis, typed_od_add, typed_os_sphere, typed_os_cylinder, typed_os_axis, typed_os_add, typed_pd, typed_pd_type (mono | binocular), rx_expiration_date, certification_checked (bool), auto_check_results_json, checksum_sha256, scan_quality_score, uploaded_at, uploaded_by_ip, uploaded_by_user_agent, deleted_at (nullable, soft-delete)

**`rx_reviews`** — human decisions on Rx files
- id (uuid), rx_file_id (fk), reviewer_user_id (fk), decision (approved | rejected | needs_info), decision_reason (enum), notes, reviewed_at

**`work_orders`** — generated after Rx approval
- id (uuid), order_id (fk), line_item_id (fk), rx_file_id (fk), work_order_number (text), frame_sku, frame_shape, frame_color, frame_size, frame_eye_size, frame_bridge_size, frame_temple_length, lens_type, lens_material, coatings_json, tint, monocular_pd_od, monocular_pd_os, fitting_height, decentration_h, decentration_v, base_curve, ed_effective_diameter, axis_double_entered (bool), special_instructions, pdf_storage_path, version (int), parent_work_order_id (fk, nullable), created_at, released_to_lab_at

**`lab_jobs`** — kanban state per work order
- id (uuid), work_order_id (fk), column (inbox | ready_to_cut | on_edger | on_bench | qc | ship), priority (int), assigned_to (fk, nullable), physical_tray_qr, started_at, completed_at, qc_photos_json, lensometer_readings_json, shipment_id (fk, nullable). Note: "ship" column means "ready to pack and ship." Once tracking is entered and shipment created, the job moves off the board (completed_at set, shipment_id linked).

**`inventory_pool`** — reserved stock per SKU variant
- id (uuid), shopify_product_id, shopify_variant_id (unique), sku, frame_shape, color, size, pool_quantity, threshold_alert, last_updated_by (fk), last_updated_at

**`inventory_adjustments`** — audit trail for stock changes
- id (uuid), inventory_pool_id (fk), delta (int), reason (enum), reference_order_id (fk, nullable), user_id (fk), notes, created_at

**`returns`** — customer return/replacement requests
- id (uuid), order_id (fk), line_item_id (fk), customer_email, rma_number (unique), request_type (return | replacement | remake), reason (enum), reason_detail, photo_urls_json, preferred_resolution, admin_decision (enum), admin_notes, shopify_refund_id, store_credit_amount, replacement_work_order_id (fk, nullable), return_shipment_id (fk, nullable), status (pending | in_progress | completed | rejected), created_at, resolved_at

**`communications`** — outbound email/SMS log
- id (uuid), order_id (fk, nullable), customer_email, channel (email | sms | push), direction (outbound | inbound), type (enum), provider (resend | shopify), provider_message_id, subject, body_hash, status (queued | sent | delivered | bounced | failed), sent_at, delivered_at

**`webhook_events`** — inbound Shopify webhook idempotency
- id (uuid), shopify_event_id (unique), topic, payload_json, received_at, processed_at, processing_error

**`audit_log`** — sensitive action trail
- id (uuid), user_id (fk), action, entity_type, entity_id, before_json, after_json, ip_address, user_agent, created_at

**`user_invitations`** — lab staff onboarding
- id (uuid), email, role, token (unique), invited_by (fk), invited_at, expires_at, accepted_at, accepted_profile_id (fk, nullable)

**`product_metadata`** — cached Shopify product data (needed for work order generation)
- id (uuid), shopify_product_id, shopify_variant_id, sku, frame_shape, frame_material, frame_eye_size, frame_bridge, frame_temple_length, frame_total_width, frame_weight_g, base_curve, lens_compatibility_json, is_rx_capable (bool), is_rx_sunglass_capable (bool), max_prescription_power, last_synced_at

**`drops`** — drop lifecycle (needed for homepage + drop landing pages)
- id (uuid), slug (unique), name, number (int), hero_headline, hero_copy, hero_image_url, starts_at, ends_at, state (draft | scheduled | live | sold_out | closed), total_capacity, sold_count, revenue, marketing_notes, created_at, updated_at

**`drop_products`** — many-to-many linking drops to Shopify products
- id (uuid), drop_id (fk), shopify_product_id, display_order (int), feature_tier (hero | supporting)

**`waitlist`** — email capture scoped to drop or product (needed for drop culture)
- id (uuid), email, drop_id (fk, nullable), shopify_product_id (nullable), notify_when (launch | back_in_stock | next_drop), created_at, notified_at

**`shipments`** — physical package tracking (needed for lab shipping queue)
- id (uuid), order_id (fk), direction (outbound | return_inbound | replacement_outbound), carrier, tracking_number, tracking_url, label_storage_path, weight_g, dimensions_json, cost_usd, items_json, status (label_created | in_transit | delivered | exception | return_received), shipped_at, delivered_at, commercial_invoice_path, hs_code, declared_value

### Phase 1b tables (8 — migrated as features ship)

- **`customer_rx_history`** — view/table for repeat-order Rx reuse
- **`notifications`** — in-app notifications for admin/lab users
- **`disputes`** — chargeback/inquiry mirror from Shopify
- **`product_reviews`** — verified-purchase reviews (rating, body, photos, moderation status)
- **`discount_usage`** — promotion tracking + influencer attribution
- **`stock_alerts`** — log of low-stock notifications
- **`feature_flags`** — thin table for experiments
- **`deletion_requests`** — GDPR/CCPA erasure tracking with retention-aware purge scheduling

### Storage buckets

| Bucket | Access | Retention | Purpose |
|---|---|---|---|
| `rx-files` | Private, RLS | 3 years minimum (FTC) | Customer Rx uploads |
| `qc-photos` | Private, RLS | 2 years | Lab QC photos |
| `return-photos` | Private, RLS | 2 years | Customer return damage photos |
| `work-order-pdfs` | Private, RLS | 2 years | Generated lab work order PDFs |
| `product-images` | Public, CDN | Indefinite | Product catalog images |

### Row-Level Security posture

- Anonymous: write to `rx_files` only via signed URL for own order (token-validated). No reads.
- Customer (logged in): read own `orders`, `order_line_items`, `rx_files`, `returns`. Create `returns` for own orders.
- `reviewer`: read/write `rx_files`, `rx_reviews`, `work_orders`. Read `orders`.
- `lab_operator` / `lab_qc` / `lab_shipping`: read/write `lab_jobs` (filtered by column/assignment). Read `work_orders`, `orders`. Write `inventory_adjustments`.
- `lab_admin`: all lab tables + `inventory_pool` write.
- `founder`: full access to everything.

### Architectural principles

1. Soft deletes on PII tables (`deleted_at` on `rx_files`, `customers`, `profiles`)
2. Idempotency on all webhook handlers and reminder jobs
3. RLS enabled on every table; explicit allow-list policies
4. Typed columns over JSON where possible
5. Foreign keys enforced at DB level
6. `created_at` + `updated_at` on all tables via triggers
7. Schema versioned in git (`supabase/migrations/`)
8. Supabase Realtime opt-in per table (only `lab_jobs`, `notifications`, `inventory_pool`)

---

## 4. Customer-facing surfaces

### Design system

- **Brand:** Bold Editorial Cool
- **Base:** `#f2f5f8` (cool off-white)
- **Ink:** `#0a0a0a` (near-black)
- **Accent:** `#1a3a8a` (deep cobalt)
- **Tortoise:** `#c9b77a` (warm metadata)
- **Muted:** `#6a7888` (secondary text)
- **Type:** Inter Tight 900 (display), Fraunces italic 300 (editorial), JetBrains Mono 700 (metadata)
- **Mobile-first:** all pages responsive, ~70%+ audience expected on mobile

### Routes

**Public / marketing:**
- `/` — home + current drop (hero, countdown, 8-frame grid, waitlist capture)
- `/shop` — full catalog with filters (phase 1a: simple grid; phase 1b: shape/color/price/Rx filters)
- `/drops` — all drops past and present
- `/drops/[slug]` — individual drop page
- `/p/[handle]` — product detail page (image gallery, color swatches, lens type picker, dynamic pricing, add to cart)
- `/cart` — line items, Rx-required warnings, checkout handoff
- `/checkout` — thin route that generates Shopify checkout URL → redirect
- `/story`, `/made-in-india` — brand editorial pages
- `/lookbook` — drop photography
- `/returns`, `/privacy`, `/terms`, `/rx-disclaimer`, `/faq` — legal pages
- `/contact`, `/404`, `/500`

**Post-checkout (token-gated, no account required):**
- `/thanks/[orderId]` — thank-you page with Rx upload CTA
- `/rx/[orderId]?token=...` — Rx intake (secure link from email)
- `/track/[orderId]?token=...` — public order tracking

**Account (auth-gated):**
- `/account` — dashboard
- `/account/orders`, `/account/orders/[id]` — order history + detail
- `/account/orders/[id]/return` — return request form
- `/account/rx` — Rx history (reusable for next order)
- `/account/addresses` — saved shipping addresses

**Marketing capture:**
- `/waitlist/[dropSlug]` — waitlist signup
- `/newsletter` — email capture

### Rx intake flow (the critical path)

1. Customer pays on Shopify checkout → returns to `/thanks/[orderId]`
2. Thank-you page: if order has Rx items, prominent CTA: "Upload your prescription now"
3. Simultaneously: Resend sends Rx reminder email (5 min delay) with secure link to `/rx/[orderId]?token=...`
4. Rx intake page:
   - **Step ① REQUIRED:** image upload (direct to Supabase Storage via signed URL, JPEG/PNG/PDF, max 10MB)
   - **Step ② OPTIONAL:** typed values (OD/OS SPH/CYL/AXIS/ADD, PD) for double-check
   - **Certification checkbox (required):** "My Rx is current and unexpired"
   - Auto-checks run on submit (file validation, image content, typed-value plausibility)
   - On success: `rx_files` row created, founder notified
5. Reminder cadence if no upload: 5 min → 24h → 72h → 7d (escalate to founder)

### Key interaction details

- Cart persistence: localStorage stores cart line items (product IDs, variants, quantities, lens config). At checkout, Next.js creates a Shopify cart via Storefront API `cartCreate` + `cartLinesAdd`, retrieves the `checkoutUrl`, and redirects. Customer pays on Shopify → Shopify fires `orders/create` webhook → our mirror picks it up. No Shopify cart exists until checkout — this avoids Shopify API calls during browsing.
- Image upload: server-side API route generates a Supabase Storage signed URL → browser uploads direct to Supabase (no server bandwidth). On upload completion, a server-side API route validates the file, runs auto-checks (file exists, is image, has content, typed values in plausible ranges), and creates the `rx_files` row. **All auto-checks are server-side** — client-side validation is cosmetic only and can be bypassed.
- Caching: product listings use Next.js `fetch()` with `{ next: { revalidate: 300 } }` (5 min). Collection/drop pages use `revalidate: 900` (15 min). PDP uses `revalidate: 300`. On-demand revalidation triggered by `products/update` webhook.
- Performance budget: Lighthouse mobile > 90, LCP < 2.5s, CLS < 0.1
- SEO: server-rendered via React Server Components, schema.org Product JSON-LD on every PDP, OG images auto-generated, XML sitemap at `/sitemap.xml`

---

## 5. Ops-facing surfaces

### Admin dashboard (`/admin/*`) — for founder

- `/admin` — overview: orders today, revenue, pending Rx, active lab jobs, open returns
- `/admin/rx-queue` — split-pane: list of pending Rx uploads (left), detail with zoomable image viewer + typed values + auto-check results + approve/reject buttons (right)
- `/admin/orders` — table view with filters (date, Rx status, fulfillment, payment). Click → full order detail with timeline.
- `/admin/returns` — split-pane: return requests with customer photos, suggested resolution, approve/reject actions. Approve triggers Shopify refund/gift card/remake.
- `/admin/drops` — create/edit drops, set date range, assign products, publish. Per-drop metrics.
- `/admin/reports` — phase 1a: basic metrics. Phase 1b: drop comparison, funnel, cohort.

### Lab dashboard (`/lab/*`) — for India team

- `/lab` — 6-column kanban: Inbox → Ready to Cut → On Edger → On Bench → QC → Ship. Drag-and-drop via Supabase Realtime. Color-coded aging (green/amber/red). Filter by assigned-to-me.
- `/lab/inventory` — table with inline edit, Shopify sync, threshold alerts, CSV bulk import, adjustment history.
- `/lab/jobs/[id]` — full work order: Rx image viewer, all specs, QC photo upload, lensometer reading, print button (PDF), QR code for phone scan.
- `/lab/shipping` — ship queue: commercial invoice generation (HSN 9004.90, LUT export flag), tracking entry, "mark shipped" → Shopify fulfillment.

### Auth & roles

| Role | Access | Who |
|---|---|---|
| `founder` | Everything | Founder |
| `reviewer` | `/admin/rx-queue`, `/admin/orders` (read) | Founder initially, delegated later |
| `lab_admin` | `/lab/*` (full), `/admin/orders` (read) | Friend (lab owner) |
| `lab_operator` | `/lab` kanban (own assignments), `/lab/jobs/*` | Lab technicians |
| `lab_qc` | `/lab` kanban (QC column), `/lab/jobs/*` (QC actions) | QC person |
| `lab_shipping` | `/lab/shipping`, `/lab` kanban (Ship column) | Shipping person |

Auth via Supabase Auth (email + password). Invitation flow via `user_invitations` table. JWT sessions, 7-day expiry.

### Rx review workflow

- Phase 1 (first 30 days): founder reviews every Rx personally
- Auto-checks run first: file exists, is image, has content, typed values in plausible ranges (SPH -20 to +20, CYL -6 to +6, AXIS 0–180, PD 50–75), expiration provided, certification checked
- Auto-check failures → customer asked to re-upload before human review
- After 30 days: train lab reviewer, founder moves to random 10% audit
- All decisions logged in `rx_reviews` + `audit_log`

---

## 6. Integration surface

### Inbound webhooks (Shopify → us)

All at `/api/shopify/webhooks/*`, HMAC-verified, stored in `webhook_events`.

| Topic | Action |
|---|---|
| `orders/create` | Mirror → `orders` + `order_line_items`. Set rx_status. Send Rx reminder. Create customer row. |
| `orders/updated` | Update mirror. |
| `orders/cancelled` | Cancel pending work orders. Notify lab. |
| `refunds/create` | Update financial_status. Log in audit_log. |
| `products/update` | Refresh `product_metadata` cache. |
| `disputes/create` | Create `disputes` row. Notify founder. |
| `customers/data_request` | GDPR: export customer data. |
| `customers/redact` | GDPR: create deletion_request. |

Missed webhook recovery: nightly cron fetches last 48h of Shopify orders, upserts missing.

### Outbound API calls (us → Shopify)

| Action | API | Trigger |
|---|---|---|
| Fetch catalog | Storefront API | Page load (edge-cached 5–15 min) |
| Create/manage cart | Storefront API | Customer adds to cart |
| Generate checkout URL | Storefront API | Customer hits "Checkout" |
| Update inventory | Admin API | Lab updates pool in `/lab/inventory` |
| Mark fulfilled | Admin API | Lab marks "shipped" |
| Issue refund | Admin API | Admin approves return refund |
| Issue gift card | Admin API | Admin approves store credit |

Rate limit strategy: Admin API 2 req/sec on Basic — all writes queued via Supabase pg_cron. Reads via Storefront API (separate limits).

Abstraction: all calls in `lib/commerce/shopify.ts` — single file to replace if we ever swap platforms.

### Email flows (Resend)

| Email | Trigger | Timing |
|---|---|---|
| Rx reminder #1 | orders/create webhook | 5 min post-payment |
| Rx reminder #2 | Cron | 24h if no upload |
| Rx reminder #3 | Cron | 72h if no upload |
| Rx escalation | Cron | 7d, internal to founder |
| Rx approved | Admin approves | Immediate |
| Rx rejected | Admin rejects | Immediate |
| Return approved | Admin approves return | Immediate |
| Drop launch | Admin publishes drop | Scheduled |
| Review request | Cron | 14d post-delivery |
| Welcome | First order ships | Immediate |

All emails: Bold Editorial Cool design, sent from `hello@glassyvision.com`, logged in `communications`, idempotent.

---

## 7. Phase 1a / 1b breakdown

### Phase 1a — Infrastructure (Weeks 1–5)

**Week 1 — Foundation:** Supabase schema + auth, Shopify store + products, Sentry + Vercel pipeline, commerce abstraction layer. Deliverable: empty storefront fetching real products.

**Week 2 — Storefront:** Home page (high-fi), PDP with lens picker, cart, checkout handoff, thank-you page, shop grid, drop landing, nav + footer, mobile responsive. Deliverable: end-to-end purchase flow working.

**Week 3 — Rx intake + Admin:** Rx intake page, webhook handler, order mirror, Rx reminder emails, admin dashboard, Rx review queue, work order generation. Deliverable: full Rx lifecycle working.

**Week 4 — Lab dashboard + Inventory:** 6-column kanban with Realtime, inventory pool manager with Shopify sync, work order detail, shipping queue, PDF generation, QR codes, lab invitations. Deliverable: full ops loop working.

**Week 5 — Returns, legal, hardening:** Customer account pages, returns flow, legal pages, brand pages (Story, Made in India), waitlist, drop management, nightly reconciliation cron, error handling pass, security audit. Deliverable: feature-complete for soft launch.

### Phase 1b — Launch polish (Weeks 6–9)

**Week 6 — Soft launch:** Deploy to production, flagship photo shoot, real photos in catalog, share with 10–15 friends/family, real orders through full pipeline, fix bugs.

**Week 7 — Polish:** UX fixes from feedback, Lighthouse optimization, mobile polish, shop filters, product reviews collection, size guide, external code review.

**Week 8 — Marketing prep:** Drop 02 waitlist, discount codes, analytics (Plausible/PostHog), return auto-approval, email template polish, live chat, SEO.

**Week 9 — Public launch:** Drop 01 goes live, waitlist gets early access email, social media posts, 48h monitoring, hotfix window.

---

## 8. Returns processing

### Return policy

- **Non-Rx sunglasses:** 30-day returns. Customer initiates via `/account/orders/[id]/return`. Options: refund, replacement, store credit.
- **Rx items:** exchange/remake only (lenses are custom-cut, not resalable). Customer gets remake at our cost for quality issues, store credit for change-of-mind.
- **Damaged/defective (any):** full refund or replacement, no return shipping required. Customer keeps item.

### Return policy logic (encoded in code)

| Scenario | Resolution | Return shipping? |
|---|---|---|
| Damaged Rx | Remake at our cost → new work order | No |
| Damaged non-Rx | Refund + keep item | No |
| Wrong Rx (customer typed wrong) | 50% refund or remake at customer cost | No |
| Wrong Rx (our fault) | Full remake at our cost | No |
| Change of mind non-Rx (within 30d) | Store credit or refund | Optional (phase 2) |
| Change of mind Rx | Store credit only | No |
| Defective after 30d | Manual review | Case by case |

### Automation tiers

- **Phase 1a:** customer form + admin review queue + Shopify refund via Admin API + policy suggestions
- **Phase 1b:** auto-approve common cases (damaged → remake, damaged non-Rx → refund), auto-issue store credit, email status updates, return metrics by SKU

---

## 9. Compliance requirements

Based on compliance playbook research (see `docs/research/compliance-playbook.md`). **All claims need lawyer verification before launch.**

### Must-have for launch

1. US importer entity (Delaware LLC or similar) — required for FDA registration
2. FDA establishment registration + device listing (HQY/HQF) — ~$9,280/year
3. Impact-resistance drop-ball records from India lab per 21 CFR 801.410
4. Mandatory Rx image upload with attestation + 3-year retention + expiration-date gating
5. FTC Eyeglass Rule disclosures on `/rx-disclaimer` and Rx intake form
6. Shopify Markets geo-block restricting Rx SKUs to US + CA (block UK and other markets)
7. Clear return policy on `/returns` (FTC requirement)
8. Privacy policy (CCPA for California, PIPEDA for Canada) on `/privacy`
9. Terms of service on `/terms`
10. GST/HST registration at threshold for Canada (and BC/QC/SK PST)
11. Commercial invoice per shipment (HSN 9004.90, India origin, LUT export flag)
12. One-page MDR/complaint SOP (medical device adverse event reporting)
13. "Not a substitute for an eye exam" disclaimer on all Rx-related pages

### Biggest risks

- **Quebec (OOQ):** provincial optician-licensure enforcement against foreign DTC sellers. Mitigation: geo-block Quebec postal codes from Rx SKUs.
- **FDA fee:** ~$9,280/year flat, possibly doubled if India lab needs separate foreign establishment registration. Biggest lawyer question.
- **Customer uploads fake/expired Rx:** auto-checks + manual review + expiration certification checkbox + explicit disclaimer.

---

## 10. Risks and open items

### Critical risks

| Risk | Impact | Mitigation |
|---|---|---|
| FDA registration delay | Can't sell Rx to US | Start week 1. Soft launch sunglasses-only if delayed. |
| US entity not formed in time | Can't register FDA, can't process USD | Start Delaware LLC week 1 via Stripe Atlas. |
| Payment processor rejection | Can't accept payments | Apply Shopify Payments + Razorpay International in parallel. |
| Lab capacity exceeded | Orders stuck | Agree max weekly capacity before launch. |
| Photography delays | Placeholder images kill conversion | Schedule shoot week 5 latest. Friend's photos as fallback. |
| Fake/expired Rx uploaded | FTC legal exposure | Auto-checks + manual review + certification checkbox + disclaimer. |
| Quebec enforcement | Cease-and-desist | Geo-block Quebec from Rx SKUs. |

### Open items

| Item | Who decides | When needed |
|---|---|---|
| Domain extension (glassyvision.com vs .co) | Founder | Week 1 |
| Indian Pvt Ltd incorporation status | Founder | Week 1 |
| Delaware LLC formation method | Founder | Week 1 |
| Payment processor selection | Depends on entity timing | Week 2 |
| Margin split with lab friend | Founder + friend | Before launch |
| Shipping carrier (DHL vs FedEx vs Shiprocket X) | Founder + friend | Week 4 |
| Shipping cost model (free vs flat rate vs real-time) | Founder | Week 2 |
| Final pricing ($98–$158 range) | Founder + friend | Week 2 |
| Lawyer selection | Founder | Week 1 |
| Rx expiration window (1 year vs 2 years) | Compliance counsel | Before launch |

### Phase 1a exit criteria

- [ ] All 5 E2E flows pass on staging (browse→buy, Rx upload, Rx review→work order, lab kanban→ship, returns)
- [ ] Lighthouse mobile > 85 on all customer pages
- [ ] RLS policies verified (lab user can't access other users' data, anonymous can't read Rx files)
- [ ] Webhook HMAC verification tested with real Shopify test webhook
- [ ] At least one real end-to-end test order (Shopify → Rx → lab → shipped)
- [ ] Sentry: zero unhandled errors in 24h soak test
- [ ] External code review: no critical issues open

---

## 11. Verification strategy

Per Anthropic harness-design article: no "done" claims without evidence.

**Every feature ships with:**
1. Unit tests (Vitest) for business logic
2. Integration tests (Vitest + Supabase local) for API routes
3. E2E tests (Playwright) for critical flows
4. External code review (dispatched agent, fresh context)
5. Visual verification (Playwright screenshots vs design mockups)
6. Lighthouse CI on every deploy (fail if mobile < 85)
7. Security checklist before soft launch

---

## 12. What's NOT in phase 1

- Virtual try-on (AR) — phase 2
- Frame quiz / recommender — phase 2
- Multi-language — phase 2
- UK market — phase 2
- Subscription / annual lens refresh — phase 2
- B2B / corporate — phase 3
- Loyalty / referral codes — phase 2
- Advanced analytics / cohort — phase 2
- Mobile app — not planned

---

## References

- `docs/research/lab-workflow.md` — India optical lab process, work order fields, QC, shipping
- `docs/research/compliance-playbook.md` — FTC, FDA, Canada rules, minimum viable compliance
- `docs/research/competitor-teardown.md` — Zenni, Warby, Pair, Felix Gray, EyeBuyDirect analysis
- `CLAUDE.md` — project guardrails, do's/don'ts, workflow discipline
- `.superpowers/brainstorm/` — visual companion mockups (home page high-fi, brand direction)
