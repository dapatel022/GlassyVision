# Week 2: Rx Intake + Admin Review Queue — Design Spec

> Approved 2026-04-17. Covers customer-facing Rx upload and basic admin review queue.

## Scope

- Customer Rx intake page (`/rx/[orderId]`) — token-gated, no login required
- Admin Rx review queue (`/admin/rx-queue`) — auth-gated (founder/reviewer)
- API route for signed URL generation
- HMAC token system for secure Rx links
- Server-side auto-checks with precise thresholds
- NOT in scope: email reminders (cron), work order generation, Rx-saved-to-profile

## Architecture Decisions

### Token: Stateless HMAC (not DB-stored)

Token = `HMAC-SHA256(orderId + ":" + expiryTimestamp, RX_TOKEN_SECRET)`. Passed in URL query params. On page load, server verifies, then sets httpOnly cookie (24h) and strips token from URL via `history.replaceState`. Subsequent requests use cookie. Token expires in 30 days.

Why: No new DB columns, no session management, naturally expires, regenerable.

New env var: `RX_TOKEN_SECRET`.

### Shopify Integration: Script on Shopify Thank-You Page (not a custom /thanks route)

Shopify's Order Status page gets a script/banner linking to `/rx/ORDER-ID?token=...&exp=...`. We do NOT build a `/thanks` page — Shopify handles order confirmation. The primary entry point is the email link anyway.

The Shopify script is documentation only (not code in this repo) — founder adds it manually in Shopify admin.

### Multi-step Wizard with Server Actions (not API routes)

Three-step wizard: Upload → Typed Values → Certify+Submit. Server Actions handle all server-side operations. Follows existing `OrderWizard` pattern in the codebase.

### Per-Line-Item Rx Tracking (not per-order)

`rx_files.line_item_id` already exists. Order-level `rx_status` is a computed roll-up:
- Any line item awaiting → `awaiting_upload`
- All uploaded, any pending review → `uploaded_pending_review`
- All approved → `approved`
- Any rejected → `rejected`

## Routes

| Route | Type | Auth | Purpose |
|---|---|---|---|
| `/rx/[orderId]` | Dynamic page | Token (HMAC) → cookie | Customer Rx intake |
| `/admin/rx-queue` | Dynamic page | Supabase Auth (founder/reviewer) | Review queue |
| `/api/rx/upload-url` | API route | Token cookie | Generate Supabase Storage signed URL |

## File Structure

```
src/
├── app/
│   ├── rx/
│   │   └── [orderId]/
│   │       └── page.tsx              — server component: token verify, order fetch, state routing
│   ├── admin/
│   │   └── rx-queue/
│   │       └── page.tsx              — server component: fetch pending Rx
│   └── api/
│       └── rx/
│           └── upload-url/
│               └── route.ts          — signed URL generation (token-gated)
├── features/
│   └── rx-intake/
│       ├── components/
│       │   ├── RxIntakeWizard.tsx     — client component: step orchestration
│       │   ├── RxAssignmentStep.tsx   — multi-item: same Rx or per-item?
│       │   ├── RxUploadStep.tsx       — mobile-first image capture + upload
│       │   ├── RxTypedValuesStep.tsx  — optional OD/OS fields
│       │   ├── RxCertificationStep.tsx — disclaimer + checkbox + submit
│       │   ├── RxSuccessState.tsx     — post-upload confirmation
│       │   ├── RxStatusDisplay.tsx    — returning visitor: pending/approved/rejected state
│       │   ├── RxPhotoTips.tsx        — guidance panel before upload
│       │   └── RxOrderPending.tsx     — webhook race condition: "order processing" with auto-retry
│       ├── actions/
│       │   ├── submit-rx.ts           — server action: validate, auto-check, create rx_files
│       │   └── auto-checks.ts         — server-side plausibility checks
│       └── lib/
│           └── rx-token.ts            — HMAC token generation + verification + cookie helpers
├── features/
│   └── admin/
│       └── rx-queue/
│           ├── components/
│           │   ├── RxQueueList.tsx     — left pane: pending reviews list
│           │   └── RxReviewDetail.tsx  — right pane: image viewer + typed values + approve/reject
│           └── actions/
│               └── review-rx.ts       — server action: approve/reject, create rx_reviews row
```

## Customer Flow (Detailed)

### Page Load (Server Component)

1. Extract `token` and `exp` from query params
2. Verify HMAC: `HMAC-SHA256(orderId + ":" + exp, RX_TOKEN_SECRET) === token`
3. Check expiry: `exp > now`
4. If invalid → render error: "This link has expired or is invalid. Please check your email for a valid link."
5. Set httpOnly cookie `rx_session` (orderId + 24h expiry, signed)
6. Fetch order from Supabase by `shopify_order_number` matching orderId
7. **Webhook race condition:** If order not found, render `RxOrderPending` (auto-retry every 3s, max 30s, then fallback: "We've sent an upload link to your email")
8. Check order state:
   - `cancelled` → "This order has been cancelled"
   - `has_rx_items = false` → "This order doesn't require a prescription"
9. Fetch existing `rx_files` for this order
10. Route to correct state:
    - No uploads for any Rx line item → `RxIntakeWizard`
    - All uploaded, pending review → `RxStatusDisplay` ("Under review")
    - Any rejected → `RxIntakeWizard` pre-loaded with rejection reason for re-upload
    - All approved → `RxStatusDisplay` ("Approved, in production")
    - Partial uploads → `RxIntakeWizard` showing which items still need Rx

### Rx Assignment Step (only for multi-Rx-item orders)

- Show list of Rx-required line items with product name, variant, SKU
- Two options: "Same prescription for all" (single upload) or "Different prescription for each"
- If single Rx item, skip entirely

### Step 1: Upload Prescription Image (REQUIRED)

- **Mobile-first UI:**
  - Primary CTA: "Take a Photo" (uses `<input type="file" accept="image/*" capture="environment">`)
  - Secondary: "Choose from Files" (standard file picker, accepts JPEG/PNG/HEIC/HEIF/PDF)
- `RxPhotoTips` panel shown above upload area:
  - "Place Rx on a flat, well-lit surface"
  - "Make sure all text is readable and all corners are visible"
  - "Avoid shadows and glare"
- Client-side preview: show thumbnail of selected image
- "Retake / Choose different file" option
- On file select:
  1. Client validates: file size ≤ 10MB, MIME type in allowed list (cosmetic check only)
  2. Call `/api/rx/upload-url` with `{ orderId, filename, mimeType }` → returns signed URL + storage path
  3. Upload directly from browser to Supabase Storage via signed URL
  4. Show progress bar during upload
- Storage path: `rx-files/{orderId}/{lineItemId}/{uuid}.{ext}`
- HEIC/HEIF handling: accept on upload, convert to JPEG server-side during auto-checks (Sharp library)
- If uploading per-item, this step repeats for each line item

### Step 2: Typed Values (OPTIONAL, skippable)

- Show a sample Rx image with labeled fields so customer knows where to find values
- Two columns: OD (Right Eye) / OS (Left Eye)
- Fields per eye: SPH, CYL, AXIS, ADD (all text inputs, allow +/- notation)
- Bottom row: PD with mono/binocular toggle
  - Binocular: single PD field
  - Monocular: OD PD + OS PD fields
- Field-level tooltips explaining each value
- No client-side validation (server-side only on submit)
- Prominent "Skip this step" button
- If multiple items with different Rx, typed values per item

### Step 3: Certification + Submit

**Disclaimer text:**
> "Your prescription is your responsibility. GlassyVision does not perform eye exams and does not verify prescriptions with your eye care professional. By submitting this prescription you certify it is current, valid, and issued to you by a licensed eye care professional. Online eyewear is not a substitute for a comprehensive eye examination."

- Checkbox (REQUIRED): "I certify this prescription is current, valid, and unexpired"
- Optional: Rx expiration date picker
- "I'll do this later" link → shows: "No problem — we've sent a link to your email. Your order will be held until we receive your prescription."
- Submit button triggers `submit-rx` server action

### Server Action: `submit-rx`

1. Re-verify token cookie (don't trust client state)
2. Verify file exists in Supabase Storage at expected path
3. Compute SHA-256 checksum of file
4. If HEIC/HEIF: convert to JPEG, store converted version, update storage path
5. Run auto-checks (see table below)
6. If hard-block auto-check fails → return error, customer retries Step 1 (typed values preserved)
7. If all pass (or only warnings) → create `rx_files` row with all data including:
   - `uploaded_by_ip` (from request headers)
   - `uploaded_by_user_agent` (from request headers)
   - `checksum_sha256`
   - `scan_quality_score` (from resolution check)
8. Update `orders.rx_status` based on roll-up logic
9. Return success

### Auto-Checks (Precise Spec)

| Check | Type | Rule | Message |
|---|---|---|---|
| File exists | Hard block | Storage path resolves, file size > 0 | "Upload failed — please try again" |
| Valid image | Hard block | Opens as image (JPEG/PNG/HEIC) or valid PDF | "File doesn't appear to be a valid image or PDF" |
| Not blank | Hard block | Image has >10% non-uniform pixels (histogram) OR PDF has extractable text/images | "Image appears blank — please upload your prescription" |
| Min resolution | Hard block | ≥ 600x400 pixels | "Image is too small to read — please take a clearer photo" |
| Certification | Hard block | Checkbox was checked | "You must certify your prescription is current" |
| Expiration | Hard block | If date provided, not in the past | "This prescription appears to be expired" |
| SPH range | Warning | -20.00 to +20.00 (if typed) | "Sphere value looks unusual — please double-check" |
| CYL range | Warning | -6.00 to +6.00 (if typed) | "Cylinder value looks unusual — please double-check" |
| AXIS range | Warning | 0 to 180, integer (if typed) | "Axis must be between 0 and 180" |
| PD range | Warning | 50 to 75 mm (if typed) | "PD value looks unusual — please double-check" |

Warnings are shown to customer but do NOT block submission. They're flagged in `auto_check_results` JSON for admin review.

### Re-Upload Flow (Rejected Rx)

- Page detects existing rejected `rx_files` row
- Shows rejection reason from `rx_reviews.decision_reason` + `rx_reviews.notes`
- Wizard opens at Step 1 with banner: "Your prescription was rejected: [reason]. Please upload a clearer photo."
- Old `rx_files` row gets `deleted_at = now()` (soft delete, kept for audit trail)
- New row created on successful re-upload
- Order `rx_status` returns to `uploaded_pending_review`

### "I'll Do This Later" Path

- Shown as a secondary link on every step
- On click: "No problem — we've sent a link to your email. Your order will be held until we receive your prescription."
- No DB changes needed — order stays at `awaiting_upload`, reminder emails will fire (Week 3 scope)

## Admin Review Queue

### `/admin/rx-queue` — Split Pane Layout

**Left pane: Queue list**
- Fetches `rx_files` where `deleted_at IS NULL` joined with `rx_reviews` to find un-reviewed files
- Sorted by `uploaded_at ASC` (oldest first — FIFO)
- Each row shows: order number, customer email, upload time, auto-check status (pass/warnings)
- Click selects → loads in right pane
- Count badge in header: "12 pending"

**Right pane: Review detail**
- Zoomable image viewer (pinch-to-zoom on mobile, scroll-zoom on desktop)
- If PDF: render first page as image
- Side panel: typed values (if provided), auto-check results, order details
- Two action buttons:
  - **Approve** → `rx_decision = 'approved'`, `decision_reason = 'clean_approved'` or `'matches_typed_values'`
  - **Reject** → modal: select reason from `rx_rejection_reason` enum, optional notes text field
- On approve/reject:
  1. Create `rx_reviews` row
  2. Create `audit_log` row
  3. Update `orders.rx_status` (roll-up)
  4. Refresh queue list
- Keyboard shortcuts: `A` to approve, `R` to reject (founder will review many — speed matters)

### Server Action: `review-rx`

1. Verify user is founder or reviewer (from session)
2. Validate `rx_file_id` exists and is not already reviewed
3. Create `rx_reviews` row
4. Create `audit_log` row (action: 'rx_review', entity_type: 'rx_files', before/after data)
5. Recompute `orders.rx_status` roll-up
6. Return updated queue

## Security

| Concern | Mitigation |
|---|---|
| Token in URL logged | Strip from URL after verification via `history.replaceState`, set httpOnly cookie |
| Signed URL abuse | `/api/rx/upload-url` verifies token cookie before issuing URL, URL expires in 5 min |
| PII (Rx images) | Stored in private Supabase bucket (`rx-files`), RLS: founder/reviewer only, HTTPS only |
| Cancelled/non-Rx orders | Server component checks order status + `has_rx_items` before rendering wizard |
| Upload without submit | Orphaned files cleaned up by future daily job (documented tech debt for now) |
| IP/UA logging | Captured in `rx_files` row for compliance audit trail |
| CSRF on server actions | Next.js Server Actions have built-in CSRF protection |

## Compliance (FTC Eyeglass Rule)

All requirements from `docs/research/compliance-playbook.md` are addressed:

- **"Have on file":** Customer uploads image → stored in Supabase Storage → `rx_files` row links to order
- **Validity/expiration:** Optional expiration date, auto-rejected if past. Admin catches visually if not provided.
- **3-year retention:** `rx_files.deleted_at` is soft delete. Storage retention policy: 3 years minimum. No hard deletes.
- **Customer attestation:** Mandatory checkbox with specific legal language
- **Audit trail:** `rx_files` captures timestamp, IP, user agent, checksum. `rx_reviews` captures reviewer, decision, reason. `audit_log` captures before/after state.
- **No doctor verification claims:** Disclaimer explicitly states "does not verify prescriptions with your eye care professional"
- **PD handling:** Customer provides PD (mono or binocular). Not from prescriber.

## Known Tech Debt (Documented, Not Week 2)

1. **Orphaned storage files** — upload succeeds but submit never runs. Needs cleanup cron.
2. **Email reminders** — 5min → 24h → 72h → 7d cadence. Week 3 scope (needs Resend + cron).
3. **HEIC conversion** — requires Sharp library. If conversion fails, fall back to storing original.
4. **Image blank check** — histogram analysis is approximate. May need tuning after real uploads.
5. **Supabase Realtime for admin queue** — polling/refresh for now, real-time later.
6. **Rx saved to customer profile** — `/account/rx` is a future feature.

## Dependencies

- `sharp` — HEIC → JPEG conversion + image metadata (resolution check)
- Supabase Storage signed URLs — already available via `@supabase/supabase-js`
- No new external services needed

## Done Criteria

- [ ] Customer can upload Rx image via `/rx/[orderId]?token=...` on mobile and desktop
- [ ] HEIC images from iPhones are accepted
- [ ] Typed values can be optionally entered
- [ ] Certification checkbox + disclaimer are shown and required
- [ ] Auto-checks run server-side with correct thresholds
- [ ] Warnings shown but don't block, hard blocks require retry
- [ ] Multi-Rx-item orders handled (same Rx or per-item)
- [ ] Re-upload works after rejection
- [ ] "I'll do this later" path works gracefully
- [ ] Webhook race condition handled (order pending state with auto-retry)
- [ ] Cancelled and non-Rx orders show appropriate errors
- [ ] Token stripped from URL after verification, cookie used for subsequent requests
- [ ] Admin can view pending Rx at `/admin/rx-queue`
- [ ] Admin can approve or reject with reason
- [ ] All decisions logged in `rx_reviews` + `audit_log`
- [ ] Keyboard shortcuts (A/R) work in review queue
- [ ] Build passes, all tests pass, lint clean
- [ ] IP + user agent captured on upload
