# Priority-2 Polish — Design Spec (2026-06-26)

> Closes the four "code feature gaps a professional Rx site expects" from
> `docs/launch/2026-05-31-launch-checklist.md` §Priority-2. The launch-critical
> path (Supabase/Shopify/Resend/Sentry account setup) is a founder action and is
> **out of scope** here — this spec covers only code Claude can land autonomously.

**Four features, one spec, one plan, built in this order** (pure-logic first,
broad-UI last), with an external code review after each:

1. Transactional emails (gap-fill)
2. Deeper optical validation (incl. prism end-to-end)
3. Edge-case hardening (webhook poison-pill cap + guest-customer dedupe)
4. Accessibility (WCAG 2.1 AA pass)

Locked decisions (from 2026-06-26 brainstorm):
- **Emails:** gap-fill only — do NOT duplicate Shopify's order-confirmation /
  shipping-confirmation. Add only the two ops-state emails Shopify can't send.
- **Optical:** include **prism** end-to-end now; **defer** progressive
  segment-height (no SKU needs it yet).

---

## Feature 1 — Transactional emails (gap-fill)

### Problem
Between "customer uploads Rx" and "order ships" the customer hears nothing from
us. Shopify already auto-sends order-confirmation (on purchase) and
shipping-confirmation (when we create a fulfillment with tracking), and the
subscription lifecycle is fully emailed. The only silent ops states are the two
internal review milestones Shopify has no knowledge of.

### Design
Reuse the existing pattern exactly: a `render*()` template returning
`{ subject, html, text }` built on `emailShell()`, sent via `sendEmail()`, logged
to `communications` with a pre-claim row and `(order_id, type)` dedup, best-effort
(never gates the primary transaction). Two new templates + two new `communications.type`
values:

| New template | Trigger (existing function) | Recipient resolution |
|---|---|---|
| `rx-received` ("we've got your prescription, it's in review") | end of `submitRx()` success, when an Rx image was uploaded | `order.customer_email` (Pattern 1) |
| `rx-approved` ("approved — we're crafting your lenses") | `reviewRx()` approve branch **and** `advanceRedemptionForOrder(..., 'in_production')` | order path: `order.customer_email`; subscription path: redemption→membership→customer (Pattern 2) |

- New `communications.type` values: `rx_received`, `rx_approved`. Dedup key
  `(order_id, type)` for order-bound; for the subscription `in_production` advance,
  dedup on the synthesized order id (same as `pair_shipped` keys on redemption — reuse
  that resolution).
- Both sends wrapped in try/catch; failure logs a `failed` communications row and
  never throws into the review/redemption action.
- Templates live at `src/lib/email/templates/rx-received.ts` and
  `…/rx-approved.ts`; each gets a template unit test (subject/html/text present,
  order number + CTA link interpolated) mirroring `rx-reminder-template.test.ts`.

### Out of scope (explicit)
Order-confirmation and shipping-confirmation emails — owned by Shopify. No
"entered QC" / "out for delivery" chatter (YAGNI; reduces support noise, not adds).

### Verification
- Unit: each template renders; `reviewRx` approve sends `rx_approved` exactly once
  (idempotent on replay); `submitRx` with image sends `rx_received`; skip-upload
  intake sends neither; email failure does not fail the action.

---

## Feature 2 — Deeper optical validation (incl. prism)

### Problem
`validateTypedValues()` (`src/features/rx-intake/actions/auto-checks.ts`) checks
only sphere ±20 / cyl ±6 / axis 0–180 / PD 50–75. It misses add-power range,
cross-field axis/cyl sanity, high-index guidance, anisometropia, and **prism**
(no schema field at all). Worse, the warnings it *does* compute are stored in
`rx_files.auto_check_results` but **never shown on the admin review screen**.

### Design

**2a. Prism end-to-end (new data).**
- Migration: add to `rx_files` — `typed_od_prism`, `typed_os_prism` (text, prism
  diopters Δ), `typed_od_base`, `typed_os_base` (text, one of `up|down|in|out`).
  Nullable; prism is optional. Update `src/lib/supabase/types.ts`.
- Intake form (`RxTypedValuesStep.tsx`): add an optional prism amount input + base
  direction select per eye, grouped under an "Advanced (prism)" disclosure so it
  doesn't clutter the common case. Plumb through `RxTypedValues` → `submitRx`.
- Work-order plumbing (`generate-work-order.ts`): carry prism + base into the work
  order so the lab sees it (store alongside the existing typed_* sphere/cyl/axis
  metadata; no new lab UI logic beyond display).

**2b. Enriched pure-function checks** (extend `validateTypedValues`, all return the
existing `AutoCheckResult` shape `{ field, passed, type, message }`):
- `add` range 0.50–3.50 (warning outside).
- Cross-field: cylinder non-zero but axis empty/zero → warning (`axis required with
  cylinder`); axis present but cylinder empty → warning. Per eye.
- High-index **suggestion** (type `warning`, message framed as advisory) when
  |sphere| ≥ 4.00 or |cyl| ≥ 2.00.
- Anisometropia: |OD sphere − OS sphere| > 3.00 → "large difference, double-check".
- Prism: if prism amount present, base must be one of the four directions
  (else warning); prism amount > 6Δ → warning ("unusually high, confirm"); base set
  but amount empty → warning. Per eye.

**2c. Surface warnings on admin review.** Render the stored `auto_check_results`
warnings as an alert block in `RxReviewDetail.tsx`, above the typed-values summary —
field name + message, visually distinct (amber), non-blocking. The admin still must
eyeball the image and approve manually (compliance rule 5 unchanged). Warnings are
advisory only — **none of them block approval**; the image remains the source of truth.

### Verification
- Unit (extend `auto-checks.test.ts`): each new check fires on out-of-range / bad
  cross-field / prism input and passes on valid input; high-index + anisometropia are
  `warning` not `error`.
- Migration applies; types regenerate/extend cleanly; intake round-trips prism into
  `rx_files`; admin screen renders warnings (component render test if feasible, else
  manual screenshot in verification).

---

## Feature 3 — Edge-case hardening

### 3a. Webhook poison-pill cap
**Problem:** `webhook_events` has no attempt counter. A payload that throws on every
parse is retried by Shopify forever (`processed_at` stays null), and on each retry we
re-run the handler — a permanently-broken event can wedge attention/log noise.

**Design:**
- Migration: add `attempt_count int not null default 0` to `webhook_events`.
- In `src/app/api/shopify/webhooks/route.ts`, on the reprocess branch (duplicate key,
  `processed_at IS NULL`): increment `attempt_count`. If it reaches `MAX_WEBHOOK_ATTEMPTS`
  (5), **park** the event — set `processed_at = now()` and
  `processing_error = 'parked: max attempts exceeded'`, capture to Sentry
  (`captureMessage`, level warning, with topic + event id), and return **200** so
  Shopify stops retrying a dead payload. Below the cap, behave as today.
- This is fail-safe: parking only happens after 5 genuine failures; a transient error
  still gets its retries.

**Verification (extend `route.test.ts`):** 5th failed reprocess parks (sets
`processed_at`, error text, returns 200, no handler re-run); 4th still reprocesses;
a success before the cap clears normally.

### 3b. Guest-customer email dedupe
**Problem:** guest checkout path in `sync.ts` (lines ~113–143) does SELECT-by-email
then INSERT — two concurrent same-email guest orders create two `customers` rows.
Then `linkCustomerByVerifiedEmail` updates **all** matching rows → violates the
`auth_user_id` partial-unique index → account-claim crashes.

**Design:**
- Migration: consolidate any pre-existing guest dupes (keep oldest row per
  `lower(email)` among `shopify_customer_id IS NULL`, repoint `orders.customer_id` and
  any FK references, delete the extras) **then** add a partial unique index
  `unique (lower(email)) where shopify_customer_id is null`. Order matters — dedupe
  before the index or creation fails.
- Rewrite the guest path in `sync.ts` as an atomic `INSERT … ON CONFLICT
  (lower(email)) WHERE shopify_customer_id IS NULL DO UPDATE` (race-safe; one row per
  guest email). The authenticated path (`onConflict: shopify_customer_id`) is unchanged.
- With at-most-one guest row per email, `linkCustomerByVerifiedEmail` linking all
  unclaimed matches can no longer collide; leave it as-is (now provably safe), but add
  a regression test for the previously-crashing multi-row scenario.

**Verification:** unit test for the consolidation logic; concurrent-guest test asserts
a single row; link-customer test for the (now-impossible) multi-row case resolves
without a unique violation.

> Caveat: Supabase CLI/Docker may be unavailable locally — migrations validated by
> inspection and run against the cloud DB per the runbook. Note in the plan.

---

## Feature 4 — Accessibility (WCAG 2.1 AA pass)

### Problem
Zero a11y tooling; concrete gaps across the storefront (unlabeled form inputs, no
`aria-live` on status messages, missing `aria-expanded`/`aria-selected`/`aria-pressed`
on custom controls, decorative images without `aria-hidden`, broken homepage heading
hierarchy, no skip-link, failing contrast tokens).

### Design (targeted, mechanical fixes — no behavior change)
- **Tooling:** add `eslint-plugin-jsx-a11y` (recommended ruleset) to
  `eslint.config.mjs` so regressions fail `npm run lint`. Fix every error it surfaces.
- **Global:** skip-to-main link in `src/app/(site)/layout.tsx` (`sr-only
  focus:not-sr-only`), `<main id="main-content">`.
- **Forms:** real `<label htmlFor>` (or `aria-label` where visually labelless) on the
  Waitlist email/phone and account-login email inputs; wrap every async status message
  (Waitlist, Newsletter, login, cart error) in `role="status" aria-live="polite"`
  (errors `role="alert"`).
- **Controls:** `aria-expanded` on the mobile menu toggle (`SiteHeader`);
  `aria-pressed`/`aria-selected` on color swatches (`HeroShowcase`), PDP step tabs +
  lens cards (`PdpConfigurator`), PD-type toggle (`RxTypedValuesStep`), and quiz
  options; `role="tab"`/`tablist` where a tab pattern is used.
- **Images/decoration:** `aria-hidden="true"` on decorative `Image alt=""` thumbnails
  (`ProductGallery`, `CartLineItem`), decorative SVGs, and emoji-in-buttons; descriptive
  `aria-label` on gallery thumbnail buttons.
- **Headings:** ensure each page has a single top-level `<h1>` and no skipped levels
  (homepage starts at `<h2>` today).
- **Contrast:** darken the failing tokens in `globals.css` so text pairs meet 4.5:1
  (`muted-soft` ~1.8:1 on `base` today; `tortoise` on light bg borderline). Adjust
  token values, re-verify with a contrast check; keep the brand direction.

### Scope guard
Customer-facing surface only (storefront + `/account` + `/rx` intake). Admin/lab
dashboards are auth-gated internal tools — out of scope for this AA pass.

### Verification
- `npm run lint` clean with jsx-a11y enabled (enforceable, primary gate).
- Spot-check with axe (or Lighthouse) on home, a PDP, cart, login, Rx intake —
  no critical/serious violations; capture before/after screenshots of the contrast fix.

---

## Cross-cutting

- **TDD** for all pure logic (emails, optical checks, webhook cap, dedupe). UI a11y is
  verified by lint + axe rather than unit tests.
- **External code review** (`code-review` / `feature-dev:code-reviewer` subagent) after
  each feature; do not self-grade.
- **Migrations:** next free number is `00039` (highest today is `00038`). Planned:
  `00039` prism columns (Feature 2), `00040` webhook `attempt_count` (3a), `00041`
  guest-dedupe consolidation + partial unique index (3b). Docker may be
  down locally; validate by inspection, run against cloud per runbook. Regenerate
  `types.ts` if/when the cloud DB exists; otherwise extend by hand consistently.
- **Compliance untouched:** image-required-before-ship, manual eyeball review, 3-yr
  retention, US/CA market gate, expiration gate — none of these change. All new optical
  checks are advisory warnings, never auto-approve, never block on typed values.
- **No new deps beyond `eslint-plugin-jsx-a11y`** (and its peers). Keeps tooling < budget.

## Done criteria
- 2 new email templates + sends, idempotent, best-effort; template + action tests green.
- Optical: prism stored end-to-end; 5 new check families; warnings visible on admin
  review; tests green.
- Webhook cap + guest dedupe migrations + code; regression tests green.
- a11y: jsx-a11y lint clean; skip-link, labels, aria-live, control states, contrast
  fixed; axe spot-check clean on 5 key pages.
- Full suite green (currently 402), `npm run lint` clean, `npm run build` compiles.
