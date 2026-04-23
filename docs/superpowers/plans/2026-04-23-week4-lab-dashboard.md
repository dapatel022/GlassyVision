# Week 4: Lab Dashboard + Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the full ops loop — admin generates work orders from approved Rx, lab team moves jobs through a 6-column kanban board with Realtime, captures QC photos, and ships. Scoped to what's buildable without the specific brand/lab-process decisions that are still open.

**Architecture:** Work-order generation is a server action triggered by Rx approval. Lab kanban is a Supabase Realtime-subscribed grid of cards grouped by the `kanban_column` enum. QC photos use Supabase Storage. Shipping records live in `shipments`. PDF work orders and QR codes are rendered on demand from `/api/work-orders/[id]/pdf`.

**Tech Stack:** Next.js 16, Supabase Realtime (channel subscribe on `lab_jobs`), `pdf-lib` for PDF generation, `qrcode` for QR codes, role-guarded layouts already in place.

**Scope reduction vs spec:**
- **Shipping carrier integration (DHL/Shiprocket)** is deferred — we record tracking numbers manually for now
- **Shopify inventory sync** (Admin API `inventoryAdjustQuantity`) included as a stub function; real push enables when Shopify is configured
- **Lab invitations by email** — stub endpoint only, wait for Resend integration to actually send the invite

**Out of scope:**
- Real push notifications to lab staff
- Camera auto-capture of QC photos (use file upload)
- Multi-site lab orchestration

---

## Task 1: Add dependencies (`pdf-lib`, `qrcode`)

- [ ] **Step 1:** `npm install pdf-lib qrcode && npm install -D @types/qrcode`
- [ ] **Step 2:** verify `npm run build` still succeeds

**Done criteria:** packages appear in `package.json`, `npm run build` clean.

---

## Task 2: Work-order generation server action

**Files:**
- Create: `src/features/admin/actions/generate-work-order.ts`
- Create: `tests/features/admin/generate-work-order.test.ts`

**Behavior:** Given an approved `rx_file_id`, reads the rx file + its order + line item + product metadata, computes lens specs (pd, decentration, fitting height), assigns `work_order_number` (format `WO-YYYYMM-NNN`), inserts into `work_orders`, and seeds a `lab_jobs` row in `inbox` column.

**Interface:**
```ts
export async function generateWorkOrder(rxFileId: string): Promise<{ success: true; workOrderId: string } | { success: false; error: string }>
```

**TDD:** test covers success (writes work_order + lab_job), "rx not approved" rejection, and idempotency (one work order per rx_file).

**Done criteria:** 3 tests green; action callable from admin UI.

---

## Task 3: Auto-generate work orders on Rx approval

**Files:**
- Modify: `src/features/admin/rx-queue/actions/review-rx.ts`
- Modify: `tests/features/admin/review-rx.test.ts`

**Behavior:** when `reviewRx` decision is `'approved'`, call `generateWorkOrder(rxFileId)` after the review row inserts. If work-order creation fails, rollback-style: keep the review (decision is admin-binding) but log to audit_log so admin can retry.

**Done criteria:** review-rx approval tests assert `work_orders.insert` was called.

---

## Task 4: Admin work-order detail page

**Files:**
- Create: `src/app/admin/work-orders/[id]/page.tsx`
- Create: `src/features/admin/work-orders/components/WorkOrderDetail.tsx`

**Behavior:** server component reads work order + joined rx_file/order/line_item, renders:
- Customer info (email, order number)
- Frame spec table
- Lens spec table (type, material, coatings, tint, PD, decentration)
- Rx spec (typed values + link to image)
- Actions: "Download PDF", "Copy work-order number", "Release to lab" (sets `released_to_lab_at` + moves job to `ready_to_cut`)

**Done criteria:** page renders, actions work, role-guarded to founder/reviewer/lab_admin.

---

## Task 5: Work-order PDF + QR code endpoint

**Files:**
- Create: `src/app/api/work-orders/[id]/pdf/route.ts`
- Create: `src/features/admin/work-orders/lib/pdf-generator.ts`

**Behavior:** `GET /api/work-orders/:id/pdf` generates a US Letter PDF with:
- Large `WO-YYYYMM-NNN` at top + QR code linking to the detail URL
- Frame + lens spec tables
- PD, decentration, lens height callouts
- Special instructions footer

Stores the generated PDF in Supabase Storage at `work-orders/{id}.pdf` and updates `work_orders.pdf_storage_path`. Returns the PDF binary to the client.

**Done criteria:** GETting the endpoint downloads a valid PDF; `pdf_storage_path` populated.

---

## Task 6: Lab kanban page (server + client with Realtime)

**Files:**
- Create: `src/app/lab/page.tsx` (server — auth + initial data fetch)
- Create: `src/app/lab/client.tsx` (client — Realtime subscribe + state)
- Create: `src/features/lab/components/KanbanBoard.tsx`
- Create: `src/features/lab/components/KanbanColumn.tsx`
- Create: `src/features/lab/components/JobCard.tsx`
- Create: `src/features/lab/actions/move-job.ts`

**Behavior:**
- 6 columns: `inbox`, `ready_to_cut`, `on_edger`, `on_bench`, `qc`, `ship`
- Job cards show work_order_number, customer initials, frame SKU, priority, assignee avatar
- Drag-and-drop between columns (HTML5 drag events or simpler: click-menu to move)
- Realtime subscription on `lab_jobs` channel — updates reflect for all users
- Priority sort within each column

**Simpler UI first:** click a job card → modal with "Move to: [dropdown]" + Assign dropdown. Drag-and-drop can come in Week 7 polish.

**Done criteria:** 6 columns render with seed data; click-to-move works + persists; Realtime push updates a second browser tab within ~1s.

---

## Task 7: Lab job detail drawer

**Files:**
- Create: `src/features/lab/components/JobDetailDrawer.tsx`

**Behavior:** when a job card is clicked, open side drawer with:
- Work order number + frame info
- Rx spec (read-only)
- Lensometer reading entry form (sphere/cyl/axis for both eyes, saved to `lab_jobs.lensometer_readings` JSONB)
- QC photo upload (saved to `lab-qc/{job_id}/{uuid}.jpg`, path pushed to `lab_jobs.qc_photos` JSONB array)
- "Assigned to" picker (lab users only)
- Notes field
- "Mark complete" (moves to next column + sets `started_at`/`completed_at` timestamps)

**Done criteria:** lensometer + photos + notes persist across reloads; moving out of `qc` column requires at least one QC photo (block otherwise).

---

## Task 8: Shipping queue (final column → shipment row)

**Files:**
- Create: `src/app/lab/shipping/page.tsx`
- Create: `src/features/lab/actions/create-shipment.ts`

**Behavior:** lists jobs in the `ship` column. For each, form to enter: carrier (dropdown: DHL, FedEx, Shiprocket, India Post), tracking number, ship date. Submit creates a `shipments` row, links `lab_jobs.shipment_id`, sets `completed_at`, and updates `orders.fulfillment_status = 'shipped'`.

**Done criteria:** shipped job disappears from `ship` column and appears in a "Recently shipped" list below.

---

## Task 9: Inventory pool manager

**Files:**
- Create: `src/app/admin/inventory/page.tsx`
- Create: `src/features/admin/inventory/actions/update-reserved.ts`
- Create: `src/features/admin/inventory/lib/shopify-sync.ts` (stub for Admin API `inventoryAdjustQuantity`)

**Behavior:** table view of `inventory_pool` rows — for each SKU variant: `on_hand`, `reserved`, `available` (computed), last_shopify_push. Admin can manually adjust `reserved` with a reason (logged to audit_log). "Push to Shopify" button calls Shopify Admin API (stub returns success for now, real sync added when Shopify live).

**Done criteria:** admin sees table; adjustments persist + log to audit; Shopify push flagged as "stubbed" in UI.

---

## Task 10: Lab user invitations (stub)

**Files:**
- Create: `src/app/admin/team/page.tsx`
- Create: `src/features/admin/team/actions/invite-user.ts`
- Create: `src/app/invite/[token]/page.tsx` — accept-invite screen

**Behavior:** admin enters email + role (lab_operator | lab_qc | lab_shipping | reviewer). Creates `user_invitations` row with HMAC-signed token + 7-day expiry. Email sending is stubbed (logs the invite URL to console until Resend integration). Accept page creates the `profiles` row + Supabase Auth user on token verification.

**Done criteria:** invite flow works end-to-end with a manually-copied URL (no email send yet); accepted invite creates functional login.

---

## Task 11: Final verification + tag

- [ ] **Step 1:** `npx vitest run` — all tests pass (expect 50+)
- [ ] **Step 2:** `npm run lint` — 0 errors
- [ ] **Step 3:** `npm run build` — new routes visible:
  - `/admin/work-orders/[id]`, `/admin/inventory`, `/admin/team`
  - `/api/work-orders/[id]/pdf`
  - `/lab` (kanban), `/lab/shipping`
  - `/invite/[token]`
- [ ] **Step 4:** `git tag -a v0.4.0-week4 -m "Week 4: Lab dashboard, work orders, inventory, invitations"`

---

## Done Criteria Checklist

- [ ] Admin approves an Rx → work order auto-generated + lab job lands in `inbox`
- [ ] Admin can view full work-order detail + download PDF with QR code
- [ ] Lab user sees all pending jobs on 6-column kanban
- [ ] Lab user can move jobs between columns; update reflects on other tabs via Realtime
- [ ] Lab user can enter lensometer readings + upload QC photos
- [ ] Lab user completes job in `ship` → enters carrier/tracking → shipment recorded + order marked shipped
- [ ] Admin can view inventory pool + adjust reservations (Shopify sync stubbed)
- [ ] Admin can invite a new lab user by email (copy link manually until Resend)
- [ ] Build + tests + lint clean, `v0.4.0-week4` tagged
