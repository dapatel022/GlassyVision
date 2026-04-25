# GlassyVision — Demo Runbook

A click-by-click tour of the full platform against a local Supabase + dev server. Everything below works without Shopify, real email, or any external service.

## One-time setup

```bash
# 1. start local Supabase (Postgres + Auth + Storage on :54321)
npx supabase start

# 2. install + dev server (port 3001 if 3000 is busy)
npm install
npm run dev
```

`.env.local` should already point at the local Supabase URLs. If you're missing keys, run `npx supabase status -o env` and copy `ANON_KEY` + `SERVICE_ROLE_KEY` into `.env.local`.

## Reset to known demo state any time

```bash
npm run demo:reset      # re-applies migrations + reseeds 5 orders
npm run demo:tokens     # prints fresh HMAC URLs for every seeded order
```

`demo:tokens` will output something like:

```
Order GV-1001
  Thanks:  http://localhost:3001/thanks/GV-1001
  Rx:      http://localhost:3001/rx/GV-1001?token=…&exp=…
  Track:   http://localhost:3001/track/GV-1001
  Returns: http://localhost:3001/returns/start/GV-1001?token=…&exp=…
```

## Seeded users (password: `password123`)

| Email | Role | Sees |
|---|---|---|
| `founder@glassyvision.dev` | founder | everything |
| `reviewer@glassyvision.dev` | reviewer | `/admin/rx-queue` only |
| `labadmin@glassyvision.dev` | lab_admin | `/lab` + shipping + work orders |
| `labop@glassyvision.dev` | lab_operator | `/lab` (read-mostly) |

## Seeded orders (5 different states)

| Order | Customer | State | What it demonstrates |
|---|---|---|---|
| `GV-1001` | Test Customer | Awaiting Rx upload | Full customer journey from scratch |
| `GV-1002` | Priya Shah | Rx uploaded, pending review | Reviewer's queue + auto-checks |
| `GV-1003` | Arjun Patel | Approved → lab `inbox` | Work order auto-generation |
| `GV-1004` | Meera Iyer | Approved → lab `on_bench` | Mid-production state |
| `GV-1005` | Rohan Gupta | Shipped (FedEx) | Final state — `/track` shows 4/5 ✓ |

---

## Demo Tour A — Customer flow (GV-1001 from scratch)

1. **`/thanks/GV-1001`** — post-checkout thank-you, "UPLOAD YOUR PRESCRIPTION" CTA.
2. **Click CTA** → lands on `/rx/GV-1001?token=…` (the wizard).
3. **Choose Rx file** → click "Choose from Files" and pick `public/demo/sample-rx.jpg` (a synthetic Rx image we ship for demos).
4. Wizard auto-advances to typed values. Fill or click **Skip this step**.
5. **Certification** screen → check the box, click **Submit Prescription**.
6. **Success state** — "PRESCRIPTION UPLOADED!"

The order is now in the reviewer's queue (next tour).

## Demo Tour B — Admin / reviewer (uses GV-1002 already seeded)

1. **`/login`** as `reviewer@glassyvision.dev` / `password123`.
2. Lands on **`/admin`** dashboard. Counters show real data: "1 RX AWAITING REVIEW".
3. Click **`Rx queue`** card → **`/admin/rx-queue`**.
4. GV-1002 (Priya Shah) is auto-selected on the right. You see the uploaded image, typed values, certification check.
5. Click green **APPROVE (A)** or red **REJECT (R)** (keyboard shortcuts work too).

Approval triggers: `rx_reviews` row, `work_orders` auto-generated with monocular PD split, `lab_jobs` row in `inbox`.

## Demo Tour C — Lab kanban (uses GV-1003 + GV-1004 already seeded)

1. **`/login`** as `labadmin@glassyvision.dev`.
2. **`/lab`** shows 6 columns. INBOX has WO-202604-100, ON_BENCH has WO-202604-101.
3. Click any card → modal opens with: priority, current column, QC photos count, Open full work-order detail link.
4. **`Move to column`** dropdown — pick the next stage, click **SAVE**.
5. **At QC**: try to move the job to `ship` without a photo → red error: "QC photos required before leaving QC column".
6. Click **+ ADD PHOTO** in the modal, upload an image (any JPEG/PNG), then move to ship.
7. **`/lab/shipping`** → carrier dropdown (DHL / FedEx / Shiprocket / India Post / Aramex), tracking number, click **SHIP**. Order now flips to `fulfillment_status = shipped`.

## Demo Tour D — Customer tracking (uses GV-1005 already shipped)

1. **`/track/GV-1005`** — public, no token needed.
2. See 4 stages green: ORDERED ✓ · RX RECEIVED ✓ · IN PRODUCTION ✓ · SHIPPED ✓. DELIVERED still pending.

To compare states: try `/track/GV-1001` (shipped state none — only ORDERED ✓), `/track/GV-1004` (3/5 — order is on_bench so RX RECEIVED + IN PRODUCTION are green).

## Demo Tour E — Other admin sections

| URL | Demonstrates |
|---|---|
| `/admin/inventory` | 5 SKUs with stock counts, threshold alerts, manual adjust form |
| `/admin/drops` | "The First Run" drop, edit hero copy, schedule, capacity |
| `/admin/team` | Invite a new staff member (email goes to Mailpit at `:54324` if Resend not configured) |
| `/admin/returns` | Empty by default — submit one via `/returns/start/GV-1005?token=…` first |
| `/admin/work-orders/[id]` | Per-job detail with PDF download |

## Tear down

```bash
npx supabase stop      # stops Docker containers but keeps volume
# OR
npx supabase stop --no-backup    # also wipes data
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login screen reappears after submit | Browser cached old JS bundle | Hard reload (`Cmd+Shift+R`) or new incognito |
| `/admin` blank | Dev server started before `.env.local` was written | Stop dev, `rm -rf .next`, `npm run dev` |
| `/rx/...` 500 | `RX_TOKEN_SECRET` mismatch between server and the token | Re-run `npm run demo:tokens` to mint fresh |
| Shop/PDP blank | No Shopify configured (expected) | Use admin/lab tours; storefront lights up when Shopify creds added |
| QC upload "Failed to sign" | Storage bucket missing | `npx supabase db reset` re-runs the bucket creation migration |

## Reset cheat sheet

```bash
# Wipe + reseed everything (1 minute)
npx supabase db reset

# Stop services
npx supabase stop

# Start everything from scratch
npx supabase start
npm run dev
```
