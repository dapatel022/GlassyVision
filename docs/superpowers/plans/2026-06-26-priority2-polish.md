# Priority-2 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four Priority-2 code gaps — transactional emails, deeper optical validation (incl. prism), webhook/guest-dedupe edge hardening, and a WCAG 2.1 AA pass — without touching the money path or any compliance gate.

**Architecture:** Extend existing patterns in place. Emails reuse the `render*()` → `emailShell()` → `sendEmail()` + `communications` dedup pattern via a new `sendOrderEmailOnce` helper. Optical checks extend the pure `validateTypedValues()` function and surface its stored warnings on the admin review screen; prism is plumbed end-to-end (migration → form → validation → work order). Edge hardening adds a webhook attempt counter and a guest-customer partial-unique index + atomic claim RPC. A11y is mechanical JSX/CSS fixes gated by `eslint-plugin-jsx-a11y`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Supabase (Postgres + RLS), Resend, Vitest, ESLint.

## Global Constraints

- **No compliance change:** image-required-before-ship, manual admin eyeball, 3-yr retention, US/CA market gate, Rx-expiration gate stay exactly as-is. All new optical checks are advisory `warning`s — never block approval, never auto-approve, never let typed-only values reach the lab.
- **Emails are gap-fill only:** do NOT add order-confirmation or shipping-confirmation emails (Shopify owns those). Only `rx_received` and `rx_approved`.
- **Best-effort emails:** every send is wrapped in try/catch and never fails its host action.
- **Migrations:** `00039` enum (Feature 1) + `00040` communications-once unique index (Feature 1 review fix) are taken. Remaining: `00041` prism (Feature 2), `00042` webhook attempt_count (Feature 3a), `00043` guest dedupe (Feature 3b). Docker/Supabase CLI may be unavailable locally — validate migrations by inspection; they run against the cloud DB per `docs/launch/2026-06-06-go-live-runbook.md`. Do not run `supabase db reset` unless Docker is confirmed up.
- **No new runtime deps** except `eslint-plugin-jsx-a11y` (dev-only).
- **Per CLAUDE.md:** run `npm run lint` before every commit; keep files < ~300 lines; commit with HEREDOC; end commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Baseline:** 402 unit tests green today. Each task keeps the full suite green (`npm test`).

---

# FEATURE 1 — Transactional emails (gap-fill)

Build order within feature: enum migration → dedup helper → two templates → two wirings.

### Task 1.1: Add `rx_received` to the `comm_type` enum

**Files:**
- Create: `supabase/migrations/00039_comm_type_rx_received.sql`
- Modify: `src/lib/supabase/types.ts` (the `comm_type` enum union under `Database['public']['Enums']`)

**Interfaces:**
- Produces: a usable `'rx_received'` value of `Database['public']['Enums']['comm_type']`.

- [ ] **Step 1: Write the migration**

```sql
-- 00039_comm_type_rx_received.sql
-- New transactional email type: "we received your prescription, it's in review".
-- `rx_approved` already exists in the enum; only this value is new.
alter type comm_type add value if not exists 'rx_received';
```

- [ ] **Step 2: Extend the hand-maintained TS enum**

In `src/lib/supabase/types.ts`, find the `comm_type` string-union (it lists `"rx_reminder" | "rx_approved" | "rx_rejected" | ...`) and add `"rx_received"` to it. Grep to locate:

Run: `grep -n "rx_approved" src/lib/supabase/types.ts`

Add `| "rx_received"` to that union (one place).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00039_comm_type_rx_received.sql src/lib/supabase/types.ts
git commit -m "$(cat <<'EOF'
feat(email): add rx_received comm_type for transactional intake email

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2: `sendOrderEmailOnce` dedup helper

**Files:**
- Create: `src/lib/email/transactional.ts`
- Test: `tests/lib/email/transactional.test.ts`

**Interfaces:**
- Consumes: `sendEmail` from `@/lib/email/resend`; `RenderedEmail` from `@/lib/email/templates/shared`; `comm_type` from types.
- Produces:
  ```ts
  export async function sendOrderEmailOnce(opts: {
    supabase: SupabaseClient<Database>;
    orderId: string;
    customerEmail: string;
    type: Database['public']['Enums']['comm_type'];
    rendered: RenderedEmail;
  }): Promise<{ sent: boolean; reason?: 'duplicate' | 'send_failed' | 'error' }>;
  ```
  Behavior: skip (`sent:false, reason:'duplicate'`) if a non-`failed` outbound `communications` row already exists for `(order_id, type)`; else pre-claim a `queued` row, send, update to `sent`/`failed`. Never throws.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/email/transactional.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmailMock = vi.fn();
vi.mock('@/lib/email/resend', () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));

import { sendOrderEmailOnce } from '@/lib/email/transactional';

const rendered = { subject: 'S', html: '<p>h</p>', text: 't' };

/** Minimal chainable Supabase stub: control what the dedup SELECT returns and
 *  capture inserts/updates. */
function makeSupabase(existing: unknown) {
  const inserted: unknown[] = [];
  const client = {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    neq() { return this; },
    maybeSingle: async () => ({ data: existing }),
    insert(row: unknown) { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'comm-1' }, error: null }) }) }; },
    update() { return { eq: async () => ({ error: null }) }; },
    _inserted: inserted,
  };
  return client as never;
}

beforeEach(() => { sendEmailMock.mockReset(); sendEmailMock.mockResolvedValue({ success: true, providerMessageId: 'm1' }); });

describe('sendOrderEmailOnce', () => {
  it('skips when a prior non-failed comm exists', async () => {
    const supabase = makeSupabase({ id: 'prev', status: 'sent' });
    const r = await sendOrderEmailOnce({ supabase, orderId: 'o1', customerEmail: 'a@b.com', type: 'rx_received', rendered });
    expect(r).toEqual({ sent: false, reason: 'duplicate' });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('sends when no prior comm exists', async () => {
    const supabase = makeSupabase(null);
    const r = await sendOrderEmailOnce({ supabase, orderId: 'o1', customerEmail: 'a@b.com', type: 'rx_received', rendered });
    expect(r.sent).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith({ to: 'a@b.com', subject: 'S', html: '<p>h</p>', text: 't' });
  });

  it('never throws when the send fails', async () => {
    sendEmailMock.mockResolvedValue({ success: false, error: 'boom' });
    const supabase = makeSupabase(null);
    const r = await sendOrderEmailOnce({ supabase, orderId: 'o1', customerEmail: 'a@b.com', type: 'rx_received', rendered });
    expect(r).toEqual({ sent: false, reason: 'send_failed' });
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -- transactional`
Expected: FAIL ("Cannot find module '@/lib/email/transactional'").

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/email/transactional.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { RenderedEmail } from '@/lib/email/templates/shared';
import { sendEmail } from '@/lib/email/resend';

type CommType = Database['public']['Enums']['comm_type'];

/**
 * Send an order-bound transactional email at most once. Dedup is by
 * (order_id, type) over outbound, non-failed `communications` rows — so a retry,
 * double-submit, or webhook replay can't double-send. Pre-claims a `queued` row,
 * sends, then records `sent`/`failed`. Best-effort: never throws into the caller.
 */
export async function sendOrderEmailOnce(opts: {
  supabase: SupabaseClient<Database>;
  orderId: string;
  customerEmail: string;
  type: CommType;
  rendered: RenderedEmail;
}): Promise<{ sent: boolean; reason?: 'duplicate' | 'send_failed' | 'error' }> {
  const { supabase, orderId, customerEmail, type, rendered } = opts;
  try {
    const { data: prior } = await supabase
      .from('communications')
      .select('id, status')
      .eq('order_id', orderId)
      .eq('type', type)
      .eq('direction', 'outbound')
      .neq('status', 'failed')
      .maybeSingle();
    if (prior) return { sent: false, reason: 'duplicate' };

    const { data: claim } = await supabase
      .from('communications')
      .insert({ order_id: orderId, customer_email: customerEmail, type, subject: rendered.subject, status: 'queued' })
      .select('id')
      .single();

    const res = await sendEmail({ to: customerEmail, subject: rendered.subject, html: rendered.html, text: rendered.text });

    if (claim?.id) {
      await supabase
        .from('communications')
        .update(
          res.success
            ? { status: 'sent', provider_message_id: res.providerMessageId, sent_at: new Date().toISOString() }
            : { status: 'failed' },
        )
        .eq('id', claim.id);
    }
    return res.success ? { sent: true } : { sent: false, reason: 'send_failed' };
  } catch (e) {
    console.error('[transactional] send failed', { orderId, type, error: e });
    return { sent: false, reason: 'error' };
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npm test -- transactional`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add src/lib/email/transactional.ts tests/lib/email/transactional.test.ts
git commit -m "$(cat <<'EOF'
feat(email): sendOrderEmailOnce — deduped best-effort transactional sender

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: `rx-received` email template

**Files:**
- Create: `src/lib/email/templates/rx-received.ts`
- Test: `tests/lib/email/rx-received-template.test.ts`

**Interfaces:**
- Consumes: `escapeHtml`, `emailShell`, `RenderedEmail` from `./shared`.
- Produces: `renderRxReceived(input: { orderNumber: string | null }): RenderedEmail`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/email/rx-received-template.test.ts
import { describe, it, expect } from 'vitest';
import { renderRxReceived } from '@/lib/email/templates/rx-received';

describe('renderRxReceived', () => {
  it('renders subject/html/text and includes the order number', () => {
    const r = renderRxReceived({ orderNumber: '#1042' });
    expect(r.subject).toContain('#1042');
    expect(r.html).toContain('review');
    expect(r.text).toContain('#1042');
  });
  it('degrades gracefully when order number is null', () => {
    const r = renderRxReceived({ orderNumber: null });
    expect(r.subject.length).toBeGreaterThan(0);
    expect(r.html).toContain('GlassyVision');
  });
});
```

- [ ] **Step 2: Run it; verify it fails** — Run: `npm test -- rx-received-template` → FAIL (module missing).

- [ ] **Step 3: Implement the template**

```ts
// src/lib/email/templates/rx-received.ts
import { type RenderedEmail, escapeHtml, emailShell } from './shared';

/** Sent once when a customer uploads their prescription (submitRx success).
 *  Reassures them the upload landed and is queued for our manual review.
 *  Shopify never sends this — it has no knowledge of our Rx review state. */
export function renderRxReceived(input: { orderNumber: string | null }): RenderedEmail {
  const order = input.orderNumber ?? '';
  const subject = order ? `We've got your prescription — order ${order}` : `We've got your prescription`;
  const safeOrder = escapeHtml(order);
  const lead = `Thanks — we've received your prescription${safeOrder ? ` for order <strong>${safeOrder}</strong>` : ''} and it's now in our review queue. A team member checks every prescription by hand before we make your lenses; we'll email you the moment it's approved.`;
  const html = emailShell({ lead, footnote: `No action needed right now. We'll be in touch shortly.` });
  const text = `Thanks — we've received your prescription${order ? ` for order ${order}` : ''} and it's now in our review queue.

A team member checks every prescription by hand before we make your lenses. We'll email you the moment it's approved — no action needed right now.
`;
  return { subject, html, text };
}
```

- [ ] **Step 4: Run tests; verify pass** — Run: `npm test -- rx-received-template` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/rx-received.ts tests/lib/email/rx-received-template.test.ts
git commit -m "$(cat <<'EOF'
feat(email): rx-received template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.4: `rx-approved` email template

**Files:**
- Create: `src/lib/email/templates/rx-approved.ts`
- Test: `tests/lib/email/rx-approved-template.test.ts`

**Interfaces:**
- Consumes: `./shared`.
- Produces: `renderRxApproved(input: { orderNumber: string | null; ordersUrl: string }): RenderedEmail`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/email/rx-approved-template.test.ts
import { describe, it, expect } from 'vitest';
import { renderRxApproved } from '@/lib/email/templates/rx-approved';

describe('renderRxApproved', () => {
  it('renders and includes order number + orders link', () => {
    const r = renderRxApproved({ orderNumber: '#1042', ordersUrl: 'https://glassyvision.com/account/orders' });
    expect(r.subject).toContain('#1042');
    expect(r.html).toContain('https://glassyvision.com/account/orders');
    expect(r.text.toLowerCase()).toContain('approved');
  });
  it('degrades gracefully without an order number', () => {
    const r = renderRxApproved({ orderNumber: null, ordersUrl: 'https://glassyvision.com/account/orders' });
    expect(r.subject.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it; verify it fails** — Run: `npm test -- rx-approved-template` → FAIL.

- [ ] **Step 3: Implement the template**

```ts
// src/lib/email/templates/rx-approved.ts
import { type RenderedEmail, escapeHtml, emailShell } from './shared';

/** Sent once when an admin approves an uploaded prescription (reviewRx → approved).
 *  Fires for both one-time orders and synthesized subscription-redemption orders
 *  (both flow through reviewRx). Closes the silent gap between upload and ship. */
export function renderRxApproved(input: { orderNumber: string | null; ordersUrl: string }): RenderedEmail {
  const order = input.orderNumber ?? '';
  const subject = order ? `Prescription approved — order ${order} is in production` : `Your prescription is approved — we're making your lenses`;
  const safeOrder = escapeHtml(order);
  const safeUrl = escapeHtml(input.ordersUrl);
  const lead = `Good news — your prescription${safeOrder ? ` for order <strong>${safeOrder}</strong>` : ''} passed review and our lab is now crafting your lenses. You'll get a shipping confirmation with tracking as soon as it's on its way.`;
  const html = emailShell({ lead, ctaHref: safeUrl, ctaLabel: 'View your orders', footnote: `Typical lab turnaround is a few business days.` });
  const text = `Good news — your prescription${order ? ` for order ${order}` : ''} passed review and our lab is now crafting your lenses.

You'll get a shipping confirmation with tracking as soon as it's on its way.

View your orders: ${input.ordersUrl}
`;
  return { subject, html, text };
}
```

- [ ] **Step 4: Run tests; verify pass** — Run: `npm test -- rx-approved-template` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/rx-approved.ts tests/lib/email/rx-approved-template.test.ts
git commit -m "$(cat <<'EOF'
feat(email): rx-approved template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Send `rx_received` from `submitRx`

**Files:**
- Modify: `src/features/rx-intake/actions/submit-rx.ts` (insert a best-effort send just before the final `return { success: true, ... }` at lines ~188–197)
- Test: `tests/features/rx-intake/submit-rx-email.test.ts` (new) — or extend `tests/features/rx-intake/submit-rx.test.ts`

**Interfaces:**
- Consumes: `sendOrderEmailOnce` (1.2), `renderRxReceived` (1.3). `order.shopify_order_number` is already selected at line ~99.

- [ ] **Step 1: Write the failing test**

```ts
// tests/features/rx-intake/submit-rx-email.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendOnce = vi.fn();
vi.mock('@/lib/email/transactional', () => ({ sendOrderEmailOnce: (...a: unknown[]) => sendOnce(...a) }));
vi.mock('@/lib/email/templates/rx-received', () => ({ renderRxReceived: () => ({ subject: 's', html: 'h', text: 't' }) }));

// NOTE: reuse the existing submit-rx test harness mocks (token verify, admin
// client, storage download, sharp). Copy the mock setup from
// tests/features/rx-intake/submit-rx.test.ts so submitRx reaches the success path.

beforeEach(() => sendOnce.mockReset());

describe('submitRx transactional email', () => {
  it('sends rx_received once on a successful upload', async () => {
    // ...arrange a valid submitRx call (see submit-rx.test.ts happy path)...
    // await submitRx(validInput);
    // expect(sendOnce).toHaveBeenCalledWith(expect.objectContaining({ type: 'rx_received' }));
    expect(true).toBe(true); // replace with the assertion above once harness is wired
  });
});
```

> Implementer note: model this test on the existing `submit-rx.test.ts` happy-path
> mock setup (it already stubs `verifyRxToken`, the admin Supabase client, storage
> download, and `sharp`). Assert `sendOnce` was called with `type: 'rx_received'`
> and that a `sendEmail`/transactional failure does not change the `{ success: true }` result.

- [ ] **Step 2: Run it; verify it fails** (the real assertion) — Run: `npm test -- submit-rx-email` → FAIL.

- [ ] **Step 3: Wire the send**

In `src/features/rx-intake/actions/submit-rx.ts`, add imports at the top:

```ts
import { sendOrderEmailOnce } from '@/lib/email/transactional';
import { renderRxReceived } from '@/lib/email/templates/rx-received';
```

Then, immediately before the final `return { success: true, ... }` (after the `orders.update({ rx_status: 'uploaded_pending_review' })` block), insert:

```ts
  // Best-effort: confirm to the customer that the upload landed and is queued for
  // manual review. Deduped on (order_id, 'rx_received'); never gates the upload.
  await sendOrderEmailOnce({
    supabase,
    orderId: input.orderId,
    customerEmail: order.customer_email,
    type: 'rx_received',
    rendered: renderRxReceived({ orderNumber: order.shopify_order_number }),
  });
```

> `order.customer_email` and `order.shopify_order_number` are already selected at the
> `orders` SELECT (line ~99). If `customer_email` can be null/`'no-email@shopify.com'`,
> guard: skip the send when it is falsy or equals `'no-email@shopify.com'`.

- [ ] **Step 4: Run tests; verify pass** — Run: `npm test -- submit-rx` → PASS (existing + new).

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add src/features/rx-intake/actions/submit-rx.ts tests/features/rx-intake/submit-rx-email.test.ts
git commit -m "$(cat <<'EOF'
feat(email): send rx_received on prescription upload

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.6: Send `rx_approved` from `reviewRx` (approve branch)

**Files:**
- Modify: `src/features/admin/rx-queue/actions/review-rx.ts` (approve branch, after `generateWorkOrder`, lines ~125–140)
- Test: `tests/features/admin/review-rx-email.test.ts` (new) — or extend `tests/features/admin/review-rx.test.ts`

**Interfaces:**
- Consumes: `sendOrderEmailOnce` (1.2), `renderRxApproved` (1.4). Mirror the existing rejection-email block (lines ~103–122) for the order fetch.

- [ ] **Step 1: Write the failing test**

```ts
// tests/features/admin/review-rx-email.test.ts
// Mirror tests/features/admin/review-rx.test.ts mock setup (admin client, auth
// getCurrentUser→admin role, generateWorkOrder). Add:
import { vi } from 'vitest';
const sendOnce = vi.fn();
vi.mock('@/lib/email/transactional', () => ({ sendOrderEmailOnce: (...a: unknown[]) => sendOnce(...a) }));
vi.mock('@/lib/email/templates/rx-approved', () => ({ renderRxApproved: () => ({ subject: 's', html: 'h', text: 't' }) }));

// it('sends rx_approved exactly once on approve'):
//   await reviewRx({ rxFileId, decision: 'approved', ... });
//   expect(sendOnce).toHaveBeenCalledWith(expect.objectContaining({ type: 'rx_approved' }));
// it('does NOT send rx_approved on reject'):
//   await reviewRx({ ..., decision: 'rejected' });
//   expect(sendOnce).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run it; verify it fails** — Run: `npm test -- review-rx-email` → FAIL.

- [ ] **Step 3: Wire the send**

Add imports to `review-rx.ts`:

```ts
import { sendOrderEmailOnce } from '@/lib/email/transactional';
import { renderRxApproved } from '@/lib/email/templates/rx-approved';
```

In the `if (input.decision === 'approved') { ... }` block, after the `generateWorkOrder` call and its error handling, append:

```ts
    // Best-effort: tell the customer their Rx passed review and is in production.
    // Fires for one-time AND synthesized subscription orders (both reach reviewRx).
    // Gated only on a real recipient, deduped on (order_id, 'rx_approved').
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('customer_email, shopify_order_number')
        .eq('id', rxFile.order_id)
        .single();
      const email = order?.customer_email;
      if (email && email !== 'no-email@shopify.com') {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://glassyvision.com';
        await sendOrderEmailOnce({
          supabase,
          orderId: rxFile.order_id,
          customerEmail: email,
          type: 'rx_approved',
          rendered: renderRxApproved({ orderNumber: order?.shopify_order_number ?? null, ordersUrl: `${baseUrl}/account/orders` }),
        });
      }
    } catch (e) {
      console.error('[review-rx] approval email failed', { rxFileId: input.rxFileId, error: e });
    }
```

- [ ] **Step 4: Run tests; verify pass** — Run: `npm test -- review-rx` → PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add src/features/admin/rx-queue/actions/review-rx.ts tests/features/admin/review-rx-email.test.ts
git commit -m "$(cat <<'EOF'
feat(email): send rx_approved when an admin approves a prescription

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**▶ After Task 1.6: dispatch an external code review** of Feature 1 (the email diff) via a `feature-dev:code-reviewer` subagent before starting Feature 2. Address findings, then continue.

---

# FEATURE 2 — Deeper optical validation (incl. prism)

### Task 2.1: Migration — prism columns on `rx_files`

**Files:**
- Create: `supabase/migrations/00041_rx_prism.sql`
- Modify: `src/lib/supabase/types.ts` (`rx_files` Row/Insert/Update — add the four nullable text columns)

**Interfaces:**
- Produces: `rx_files.typed_od_prism`, `typed_os_prism`, `typed_od_base`, `typed_os_base` (all `text | null`).

- [ ] **Step 1: Write the migration**

```sql
-- 00041_rx_prism.sql
-- Optional prism correction, typed double-check values only (the approved image
-- remains authoritative). Amount in prism diopters; base is one of up/down/in/out.
alter table rx_files
  add column if not exists typed_od_prism text,
  add column if not exists typed_os_prism text,
  add column if not exists typed_od_base  text,
  add column if not exists typed_os_base  text;
```

- [ ] **Step 2: Extend `types.ts`** — in the `rx_files` `Row`, `Insert`, and `Update` shapes add `typed_od_prism: string | null` (and `typed_os_prism`, `typed_od_base`, `typed_os_base`). For `Insert`/`Update` make them optional (`?`). Locate with:

Run: `grep -n "typed_od_add" src/lib/supabase/types.ts`
(Add the four prism fields next to each `typed_od_add` occurrence — Row, Insert, Update.)

- [ ] **Step 3: Typecheck** — Run: `npx tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00041_rx_prism.sql src/lib/supabase/types.ts
git commit -m "$(cat <<'EOF'
feat(rx): add prism columns to rx_files (typed double-check values)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: Enriched non-prism checks in `validateTypedValues`

**Files:**
- Modify: `src/features/rx-intake/actions/auto-checks.ts` (extend `RxTypedValues` + `validateTypedValues`)
- Test: `tests/features/rx-intake/auto-checks.test.ts` (extend)

**Interfaces:**
- Produces: extended `RxTypedValues` with optional `odPrism?, osPrism?, odBase?, osBase?: string`; `validateTypedValues` emits additional `AutoCheckResult` warnings (all `type:'warning'`, never `'error'`).

- [ ] **Step 1: Write the failing tests** (append to `auto-checks.test.ts`)

```ts
describe('enriched optical checks', () => {
  const base = { odSphere: '-1', odCylinder: '0', odAxis: '0', osSphere: '-1', osCylinder: '0', osAxis: '0', pd: '63', pdType: 'binocular' as const };

  it('warns when add is out of range', () => {
    const r = validateTypedValues({ ...base, odAdd: '5.00' });
    expect(r.find((x) => x.field === 'odAdd' && !x.passed)?.type).toBe('warning');
  });
  it('warns when cylinder is set but axis is missing', () => {
    const r = validateTypedValues({ ...base, odCylinder: '-1.50', odAxis: '' });
    expect(r.some((x) => x.field === 'odAxis' && !x.passed)).toBe(true);
  });
  it('suggests high-index for strong sphere (warning, not error)', () => {
    const r = validateTypedValues({ ...base, odSphere: '-5.00' });
    const hit = r.find((x) => x.field === 'odHighIndex');
    expect(hit?.passed).toBe(false);
    expect(hit?.type).toBe('warning');
  });
  it('flags large anisometropia', () => {
    const r = validateTypedValues({ ...base, odSphere: '0', osSphere: '-4.00' });
    expect(r.some((x) => x.field === 'anisometropia' && !x.passed)).toBe(true);
  });
  it('passes a clean low Rx with no new warnings', () => {
    const r = validateTypedValues(base);
    expect(r.filter((x) => !x.passed)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run; verify fail** — Run: `npm test -- auto-checks` → FAIL.

- [ ] **Step 3: Implement**

In `auto-checks.ts`, extend the interface:

```ts
export interface RxTypedValues {
  odSphere: string; odCylinder: string; odAxis: string; odAdd?: string;
  osSphere: string; osCylinder: string; osAxis: string; osAdd?: string;
  pd: string; pdType: 'mono' | 'binocular'; pdOd?: string; pdOs?: string;
  // Optional prism (Task 2.3 adds the prism-specific checks):
  odPrism?: string; osPrism?: string; odBase?: string; osBase?: string;
}
```

Add helpers above `validateTypedValues` and call them inside it (after the existing `rangeChecks` loop, before the expiration block):

```ts
const VALID_BASES = ['up', 'down', 'in', 'out'];

function num(v?: string): number | null {
  if (!v || !v.trim()) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Cross-field + advisory checks. All warnings — never block approval. */
function enrichedChecks(values: RxTypedValues): AutoCheckResult[] {
  const out: AutoCheckResult[] = [];
  const push = (field: string, message: string) => out.push({ field, passed: false, type: 'warning', message });

  for (const eye of ['od', 'os'] as const) {
    const add = num(values[`${eye}Add`]);
    if (add !== null && (add < 0.5 || add > 3.5)) push(`${eye}Add`, 'Add power looks unusual (typical 0.50–3.50) — double-check');

    const cyl = num(values[`${eye}Cylinder`]);
    const axisRaw = values[`${eye}Axis`];
    const axis = num(axisRaw);
    if (cyl !== null && cyl !== 0 && (axis === null || axis === 0) && (!axisRaw || !axisRaw.trim())) {
      push(`${eye}Axis`, 'Cylinder is set but axis is missing — an axis is required with cylinder');
    }
    if ((axis !== null && axis !== 0) && (cyl === null || cyl === 0)) {
      push(`${eye}Cylinder`, 'Axis is set but cylinder is missing — confirm the cylinder value');
    }

    const sph = num(values[`${eye}Sphere`]);
    if ((sph !== null && Math.abs(sph) >= 4) || (cyl !== null && Math.abs(cyl) >= 2)) {
      push(`${eye}HighIndex`, 'Strong correction — a high-index lens is recommended for thinner, lighter lenses');
    }
  }

  const odS = num(values.odSphere);
  const osS = num(values.osSphere);
  if (odS !== null && osS !== null && Math.abs(odS - osS) > 3) {
    push('anisometropia', 'Large difference between eyes (>3.00D) — please double-check both values');
  }
  return out;
}
```

Then inside `validateTypedValues`, after the `for (const check of rangeChecks)` loop:

```ts
  results.push(...enrichedChecks(values));
```

- [ ] **Step 4: Run; verify pass** — Run: `npm test -- auto-checks` → PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/features/rx-intake/actions/auto-checks.ts tests/features/rx-intake/auto-checks.test.ts
git commit -m "$(cat <<'EOF'
feat(rx): enriched optical checks — add range, axis/cyl cross-field, high-index, anisometropia

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3: Prism validation in `validateTypedValues`

**Files:**
- Modify: `src/features/rx-intake/actions/auto-checks.ts`
- Test: `tests/features/rx-intake/auto-checks.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

```ts
describe('prism checks', () => {
  const base = { odSphere: '-1', odCylinder: '0', odAxis: '0', osSphere: '-1', osCylinder: '0', osAxis: '0', pd: '63', pdType: 'binocular' as const };
  it('warns on an invalid base direction', () => {
    const r = validateTypedValues({ ...base, odPrism: '2', odBase: 'sideways' });
    expect(r.some((x) => x.field === 'odBase' && !x.passed)).toBe(true);
  });
  it('warns when prism amount is set but base is missing', () => {
    const r = validateTypedValues({ ...base, odPrism: '2', odBase: '' });
    expect(r.some((x) => x.field === 'odBase' && !x.passed)).toBe(true);
  });
  it('warns on an unusually high prism amount', () => {
    const r = validateTypedValues({ ...base, odPrism: '9', odBase: 'in' });
    expect(r.some((x) => x.field === 'odPrism' && !x.passed)).toBe(true);
  });
  it('accepts a valid low prism', () => {
    const r = validateTypedValues({ ...base, odPrism: '2', odBase: 'in' });
    expect(r.filter((x) => !x.passed)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run; verify fail** — Run: `npm test -- auto-checks` → FAIL.

- [ ] **Step 3: Implement** — inside `enrichedChecks`, within the `for (const eye ...)` loop, add:

```ts
    const prism = num(values[`${eye}Prism`]);
    const baseDir = (values[`${eye}Base`] ?? '').trim().toLowerCase();
    if (prism !== null && prism !== 0) {
      if (!baseDir) push(`${eye}Base`, 'Prism amount is set but base direction is missing');
      else if (!VALID_BASES.includes(baseDir)) push(`${eye}Base`, 'Base direction must be up, down, in, or out');
      if (prism > 6) push(`${eye}Prism`, 'Prism amount is unusually high (>6Δ) — please confirm');
    } else if (baseDir && VALID_BASES.includes(baseDir)) {
      push(`${eye}Prism`, 'Base direction is set but prism amount is missing');
    }
```

- [ ] **Step 4: Run; verify pass** — Run: `npm test -- auto-checks` → PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/features/rx-intake/actions/auto-checks.ts tests/features/rx-intake/auto-checks.test.ts
git commit -m "$(cat <<'EOF'
feat(rx): prism validation (amount/base cross-checks)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.4: Prism inputs in the intake form + persist to `rx_files`

**Files:**
- Modify: `src/features/rx-intake/components/RxTypedValuesStep.tsx` (add an optional "Advanced — prism" disclosure with amount + base per eye; include the new fields in the `RxTypedValues` it emits)
- Modify: `src/features/rx-intake/actions/submit-rx.ts` (persist the four prism fields in the `rx_files` insert, alongside `typed_od_add` etc.)
- Test: `tests/features/rx-intake/submit-rx.test.ts` (extend the happy-path to assert prism fields are written)

- [ ] **Step 1: Write the failing test** — extend `submit-rx.test.ts` happy path so `input.typedValues` includes `odPrism: '2', odBase: 'in'` and assert the captured `rx_files.insert` payload contains `typed_od_prism: '2'` and `typed_od_base: 'in'`. (The existing test already captures the insert payload — assert on it.)

- [ ] **Step 2: Run; verify fail** — Run: `npm test -- submit-rx` → FAIL (fields not written).

- [ ] **Step 3a: Persist in `submit-rx.ts`** — in the `rx_files` insert object, after the `typed_os_add` line, add:

```ts
      typed_od_prism: input.typedValues?.odPrism || null,
      typed_os_prism: input.typedValues?.osPrism || null,
      typed_od_base: input.typedValues?.odBase || null,
      typed_os_base: input.typedValues?.osBase || null,
```

- [ ] **Step 3b: Add the form inputs** — in `RxTypedValuesStep.tsx`, add a collapsible "Advanced (prism)" section with, per eye, a text input for prism amount and a `<select>` for base (`up|down|in|out`, plus an empty default), wired into the component's typed-values state so they flow out in the same object the wizard passes to `submitRx`. Keep them optional — empty by default, never required. Match the existing OD/OS two-column layout and label/`htmlFor` pattern from Feature 4 (Task 4.3).

- [ ] **Step 4: Run; verify pass** — Run: `npm test -- submit-rx` → PASS. Also `npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/features/rx-intake/components/RxTypedValuesStep.tsx src/features/rx-intake/actions/submit-rx.ts tests/features/rx-intake/submit-rx.test.ts
git commit -m "$(cat <<'EOF'
feat(rx): optional prism inputs in intake form, persisted to rx_files

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.5: Carry prism into the work order

**Files:**
- Modify: `src/features/admin/actions/generate-work-order.ts` (read the four prism columns from `rx_files` and include them in the work-order data the lab sees, alongside the existing `typed_*` sphere/cyl/axis metadata)
- Test: `tests/features/admin/generate-work-order.test.ts` (extend — assert prism values propagate)

- [ ] **Step 1: Write the failing test** — in the existing generate-work-order test, set prism columns on the mocked `rx_files` row and assert the resulting `work_orders` insert (or its metadata) carries `typed_od_prism` / `typed_od_base`. Match how the test currently asserts on `monocular_pd_od` etc.

- [ ] **Step 2: Run; verify fail** — Run: `npm test -- generate-work-order` → FAIL.

- [ ] **Step 3: Implement** — in `generate-work-order.ts`, add the four prism columns to the `rx_files` SELECT, then include them in the work-order insert/metadata next to the existing typed sphere/cyl/axis values. (Follow the exact shape the file already uses for `typed_od_*`.)

- [ ] **Step 4: Run; verify pass** — Run: `npm test -- generate-work-order` → PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/features/admin/actions/generate-work-order.ts tests/features/admin/generate-work-order.test.ts
git commit -m "$(cat <<'EOF'
feat(rx): carry prism (amount/base) into the lab work order

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.6: Surface warnings on the admin review screen

**Files:**
- Modify: `src/features/admin/rx-queue/components/RxReviewDetail.tsx` (render `autoCheckResults` warnings as an amber, non-blocking alert block above the typed-values summary)
- Reference: the component already receives `autoCheckResults` on its `RxDetail` prop (per recon).

- [ ] **Step 1: Implement the warnings block** — above the typed-values summary (insert after the image viewer, before the typed-values grid), add:

```tsx
{detail.autoCheckResults?.warnings && detail.autoCheckResults.warnings.length > 0 && (
  <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
    <p className="font-semibold">Auto-check warnings (advisory — verify against the image):</p>
    <ul className="mt-1 list-disc pl-5">
      {detail.autoCheckResults.warnings.map((w, i) => (
        <li key={i}><span className="font-medium">{w.field}:</span> {w.message}</li>
      ))}
    </ul>
  </div>
)}
```

> Adjust the exact prop accessor (`detail.autoCheckResults` vs `autoCheckResults`)
> and the warning shape to match the component's existing `RxDetail` typing. The
> warnings are advisory only — they must NOT disable or gate the Approve button.

- [ ] **Step 2: Typecheck + lint** — Run: `npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 3: Visual check** — `npm run dev`, open `/admin/rx-queue/<a file with warnings>`; confirm the amber block renders and Approve still works. (Capture a screenshot for the review.)

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/rx-queue/components/RxReviewDetail.tsx
git commit -m "$(cat <<'EOF'
feat(rx): surface auto-check warnings on the admin review screen (advisory)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**▶ After Task 2.6: dispatch an external code review** of Feature 2 before starting Feature 3.

---

# FEATURE 3 — Edge-case hardening

### Task 3.1: Webhook poison-pill cap

**Files:**
- Create: `supabase/migrations/00042_webhook_attempt_count.sql`
- Modify: `src/lib/supabase/types.ts` (`webhook_events` Row/Insert/Update — add `attempt_count: number`)
- Modify: `src/app/api/shopify/webhooks/route.ts` (reprocess branch + a `MAX_WEBHOOK_ATTEMPTS` constant)
- Test: `tests/api/shopify/webhooks/route.test.ts` (extend)

**Interfaces:**
- Produces: `webhook_events.attempt_count int not null default 0`; parking behavior at the cap.

- [ ] **Step 1: Write the migration**

```sql
-- 00042_webhook_attempt_count.sql
-- Poison-pill guard: count reprocess attempts so a permanently-failing payload
-- can be parked instead of retried forever.
alter table webhook_events
  add column if not exists attempt_count int not null default 0;
```

- [ ] **Step 2: Extend `types.ts`** — add `attempt_count: number` to `webhook_events` Row; `attempt_count?: number` to Insert/Update. Locate: `grep -n "shopify_event_id" src/lib/supabase/types.ts`.

- [ ] **Step 3: Write the failing test** (extend `route.test.ts`)

```ts
it('parks a webhook after MAX attempts instead of reprocessing forever', async () => {
  // Arrange: insert returns 23505 (duplicate); the existing row has
  // processed_at = null and attempt_count = 5 (already at the cap).
  // Make the handler (syncShopifyOrder) throw if called.
  // Act: POST the webhook.
  // Assert: response status 200; webhook_events update sets processed_at + a
  // 'parked' processing_error; the topic handler was NOT invoked.
});
it('still reprocesses below the cap', async () => {
  // existing row processed_at = null, attempt_count = 2 → handler runs, count increments.
});
```

> Implementer: extend the existing duplicate/reprocess test setup in
> `route.test.ts`; it already mocks the admin client and `syncShopifyOrder`.

- [ ] **Step 4: Run; verify fail** — Run: `npm test -- webhooks/route` → FAIL.

- [ ] **Step 5: Implement** — in `route.ts`:

Add near the top (after imports):

```ts
const MAX_WEBHOOK_ATTEMPTS = 5;
```

Import the Sentry helper:

```ts
import { captureMessage } from '@/lib/observability/sentry';
```

In the duplicate branch, replace the existing `existing` SELECT + reprocess logic (lines ~49–57) so it also reads `attempt_count`, parks at the cap, and otherwise increments:

```ts
      const { data: existing } = await supabase
        .from('webhook_events')
        .select('id, processed_at, attempt_count')
        .eq('shopify_event_id', eventId)
        .maybeSingle();
      if (!existing || existing.processed_at) {
        return NextResponse.json({ status: 'already_processed' });
      }
      if ((existing.attempt_count ?? 0) >= MAX_WEBHOOK_ATTEMPTS) {
        // Park the poison pill: stop Shopify's retries (return 200) and leave a
        // durable, clearly-marked record for manual inspection.
        await supabase
          .from('webhook_events')
          .update({ processed_at: new Date().toISOString(), processing_error: `parked: exceeded ${MAX_WEBHOOK_ATTEMPTS} attempts` })
          .eq('id', existing.id);
        captureMessage(`Webhook parked after ${MAX_WEBHOOK_ATTEMPTS} failed attempts: topic=${topic} event=${eventId}`, 'warning');
        return NextResponse.json({ status: 'parked' });
      }
      await supabase
        .from('webhook_events')
        .update({ attempt_count: (existing.attempt_count ?? 0) + 1 })
        .eq('id', existing.id);
      eventRowId = existing.id;
```

- [ ] **Step 6: Run; verify pass** — Run: `npm test -- webhooks/route` → PASS.

- [ ] **Step 7: Commit**

```bash
npm run lint
git add supabase/migrations/00042_webhook_attempt_count.sql src/lib/supabase/types.ts src/app/api/shopify/webhooks/route.ts tests/api/shopify/webhooks/route.test.ts
git commit -m "$(cat <<'EOF'
feat(webhooks): park poison-pill events after max attempts (Sentry alert, stop retries)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: Migration — guest dedupe (consolidate + index + claim RPC)

**Files:**
- Create: `supabase/migrations/00043_guest_customer_dedupe.sql`

**Interfaces:**
- Produces: partial unique index `uniq_guest_customer_email` on `customers (lower(email)) where shopify_customer_id is null`; RPC `claim_customers_by_verified_email(p_auth_user_id uuid, p_email text) returns int` (security definer, service_role only).

- [ ] **Step 1: Write the migration**

```sql
-- 00043_guest_customer_dedupe.sql

-- 1) Consolidate any pre-existing guest duplicates so the unique index below can
--    be created. (Fresh DB: a no-op.) Keep the oldest guest row per lower(email);
--    repoint known customer_id FKs to it, then delete the extras.
with keepers as (
  select distinct on (lower(email)) lower(email) as le, id as keep_id
  from customers
  where shopify_customer_id is null
  order by lower(email), created_at asc, id asc
),
dupes as (
  select c.id as dup_id, k.keep_id
  from customers c
  join keepers k on k.le = lower(c.email)
  where c.shopify_customer_id is null and c.id <> k.keep_id
)
update orders o set customer_id = d.keep_id
from dupes d where o.customer_id = d.dup_id;

-- repoint subscription memberships + saved addresses, if those tables exist
update subscription_memberships m
set customer_id = k.keep_id
from keepers k
where m.customer_id in (
  select c.id from customers c
  where c.shopify_customer_id is null and lower(c.email) = k.le and c.id <> k.keep_id
);

update customer_saved_addresses a
set customer_id = k.keep_id
from keepers k
where a.customer_id in (
  select c.id from customers c
  where c.shopify_customer_id is null and lower(c.email) = k.le and c.id <> k.keep_id
);

delete from customers c
using keepers k
where c.shopify_customer_id is null and lower(c.email) = k.le and c.id <> k.keep_id;

-- 2) Enforce one guest row per email going forward.
create unique index if not exists uniq_guest_customer_email
  on customers (lower(email))
  where shopify_customer_id is null;

-- 3) Atomic account-claim: bind ALL unclaimed rows for a verified email to one
--    auth user, consolidating onto the oldest (so the auth_user_id unique index
--    can never be violated by multiple matches, e.g. a guest row + a Shopify-
--    customer row sharing the email). Returns the number of source rows claimed.
create or replace function claim_customers_by_verified_email(p_auth_user_id uuid, p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep uuid;
  v_count int;
  v_dup uuid;
begin
  select id into v_keep
  from customers
  where auth_user_id is null and lower(email) = lower(p_email)
  order by created_at asc, id asc
  limit 1;

  if v_keep is null then
    return 0;
  end if;

  select count(*) into v_count
  from customers
  where auth_user_id is null and lower(email) = lower(p_email);

  for v_dup in
    select id from customers
    where auth_user_id is null and lower(email) = lower(p_email) and id <> v_keep
  loop
    update orders set customer_id = v_keep where customer_id = v_dup;
    update subscription_memberships set customer_id = v_keep where customer_id = v_dup;
    update customer_saved_addresses set customer_id = v_keep where customer_id = v_dup;
    delete from customers where id = v_dup;
  end loop;

  update customers set auth_user_id = p_auth_user_id where id = v_keep;
  return v_count;
end;
$$;

revoke all on function claim_customers_by_verified_email(uuid, text) from public, anon, authenticated;
grant execute on function claim_customers_by_verified_email(uuid, text) to service_role;
```

> Implementer: confirm the exact table names (`subscription_memberships`,
> `customer_saved_addresses`) against migrations before applying; drop any
> `update`/`delete` line for a table that doesn't exist. Validate by inspection if
> Docker is down (do not `db reset`).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00043_guest_customer_dedupe.sql
git commit -m "$(cat <<'EOF'
feat(customers): guest-email partial unique index + atomic claim consolidation RPC

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3: Race-safe guest customer write in `sync.ts`

**Files:**
- Modify: `src/lib/commerce/sync.ts` (guest branch, lines ~112–144)
- Test: `tests/lib/commerce/sync-customer-upsert.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — add a case: when the guest `INSERT` returns error code `23505` (the unique index fired on a concurrent insert), `syncShopifyOrder` recovers by selecting the existing guest row and updating it, ending with a non-null `customerUuid` (order still links). Use the existing test's Supabase mock shape.

- [ ] **Step 2: Run; verify fail** — Run: `npm test -- sync-customer-upsert` → FAIL.

- [ ] **Step 3: Implement** — replace the guest `else` block (the SELECT-by-email → UPDATE/INSERT, lines ~112–143) with an insert-first, conflict-recovering version:

```ts
      } else {
        // Guest checkout (no Shopify customer id). The partial unique index
        // `uniq_guest_customer_email` (lower(email) where shopify_customer_id is
        // null) makes this race-safe: insert first; if a concurrent delivery won,
        // we get 23505 and update the existing guest row instead.
        const { data: inserted, error: insertErr } = await supabase
          .from('customers')
          .insert(customerObj)
          .select('id')
          .single();
        if (!insertErr && inserted) {
          customerUuid = inserted.id;
        } else if (insertErr?.code === '23505') {
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .ilike('email', customerEmail)
            .is('shopify_customer_id', null)
            .maybeSingle();
          if (existing) {
            const { data: updated } = await supabase
              .from('customers')
              .update(customerObj)
              .eq('id', existing.id)
              .select('id')
              .single();
            customerUuid = updated?.id ?? existing.id;
          } else {
            console.error('[sync] guest customer conflict but no row found', { email: customerEmail });
          }
        } else {
          console.error('[sync] Failed to insert guest customer', insertErr);
        }
      }
```

- [ ] **Step 4: Run; verify pass** — Run: `npm test -- sync-customer-upsert` → PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/lib/commerce/sync.ts tests/lib/commerce/sync-customer-upsert.test.ts
git commit -m "$(cat <<'EOF'
fix(sync): race-safe guest customer write via insert-then-conflict-recover

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.4: Route account-claim through the consolidation RPC

**Files:**
- Modify: `src/features/account/actions/link-customer.ts`
- Test: `tests/features/account/link-customer.test.ts` (extend with the multi-row regression)

**Interfaces:**
- `linkCustomerByVerifiedEmail(authUserId, email)` keeps its signature/return shape (`{ linked: number }`) but delegates to the RPC.

- [ ] **Step 1: Write the failing test** — assert that when two unclaimed rows share the email (the previously-crashing case), `linkCustomerByVerifiedEmail` calls `supabase.rpc('claim_customers_by_verified_email', { p_auth_user_id, p_email })` and returns the RPC's count — no unique-violation path. Mock `supabase.rpc` to return `{ data: 2, error: null }`.

- [ ] **Step 2: Run; verify fail** — Run: `npm test -- link-customer` → FAIL.

- [ ] **Step 3: Implement** — replace the inline `.update(...).eq('email', email).is('auth_user_id', null)` with:

```ts
  const { data, error } = await admin.rpc('claim_customers_by_verified_email', {
    p_auth_user_id: authUserId,
    p_email: email,
  });
  if (error) {
    console.error('[link-customer] claim RPC failed', { error });
    return { linked: 0 };
  }
  return { linked: (data as number) ?? 0 };
```

> Add the RPC to the typed surface if `types.ts` enumerates RPCs (`Database['public']['Functions']`); if it does, add a `claim_customers_by_verified_email` entry with `Args: { p_auth_user_id: string; p_email: string }` and `Returns: number`. Otherwise cast as needed.

- [ ] **Step 4: Run; verify pass** — Run: `npm test -- link-customer` → PASS. Run the full suite: `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/features/account/actions/link-customer.ts tests/features/account/link-customer.test.ts src/lib/supabase/types.ts
git commit -m "$(cat <<'EOF'
fix(account): claim verified-email customers via atomic consolidation RPC

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**▶ After Task 3.4: dispatch an external code review** of Feature 3 (migrations + webhook + customer dedupe) before starting Feature 4. Pay special attention to the migration's FK list and the RPC's security-definer grants.

---

# FEATURE 4 — Accessibility (WCAG 2.1 AA pass)

> A11y is verified by `eslint-plugin-jsx-a11y` (enforceable, primary gate) + an axe
> spot-check, not unit tests. Scope: customer-facing surface only
> (`src/app/(site)/**`, `src/components/site/**`, `src/features/{shop,cart,rx-intake}`).
> Admin/lab dashboards are out of scope.

### Task 4.1: Add and configure `eslint-plugin-jsx-a11y`

**Files:**
- Modify: `package.json` (devDependency), `eslint.config.mjs`

- [ ] **Step 1: Install** — Run: `npm i -D eslint-plugin-jsx-a11y`

- [ ] **Step 2: Enable the recommended ruleset** — in `eslint.config.mjs`, add the plugin's flat-config recommended rules. With the existing `eslint-config-next` flat setup, add:

```js
import jsxA11y from 'eslint-plugin-jsx-a11y';
// ...in the exported config array:
jsxA11y.flatConfigs.recommended,
```

(Place it after the Next.js configs. If the file uses `FlatCompat`, instead spread `...compat.extends('plugin:jsx-a11y/recommended')`.)

- [ ] **Step 3: See what it flags** — Run: `npm run lint 2>&1 | tee /tmp/a11y-lint.txt`. Expect a list of jsx-a11y errors. These drive Tasks 4.2–4.5; do not silence rules — fix the code.

- [ ] **Step 4: Commit the tooling** (config only; fixes land in 4.2–4.5)

```bash
git add package.json package-lock.json eslint.config.mjs
git commit -m "$(cat <<'EOF'
chore(a11y): add eslint-plugin-jsx-a11y (recommended) to enforce a11y

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.2: Skip-link, main landmark, heading hierarchy

**Files:**
- Modify: `src/app/(site)/layout.tsx` (skip link + `<main id="main-content">`)
- Modify: `src/app/(site)/page.tsx` (ensure a single top-level `<h1>`; demote/reorder so no level is skipped)

- [ ] **Step 1: Add the skip link + main id** — in `src/app/(site)/layout.tsx`, before `<SiteHeader />`:

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
  Skip to main content
</a>
```

and set the existing `<main>` to `<main id="main-content">`. Confirm `.sr-only` exists in `globals.css`; if not, add the standard utility.

- [ ] **Step 2: Fix homepage headings** — ensure `page.tsx` renders exactly one `<h1>` (the hero wordmark/headline from `HeroShowcase` is acceptable as the page `<h1>`; if the hero is visual-only, add a visually-hidden `<h1 className="sr-only">GlassyVision</h1>` at the top of the page) and that subsequent sections use `<h2>`/`<h3>` in order with no skips.

- [ ] **Step 3: Verify** — Run: `npm run lint` (no new errors); `npm run dev` and tab from the top — the skip link should appear on focus and jump to main.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(site\)/layout.tsx src/app/\(site\)/page.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
fix(a11y): skip-link, main landmark, single-h1 heading order on home

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.3: Form labels + live-region status messages

**Files:**
- Modify: `src/features/shop/WaitlistForm.tsx`, `src/app/(site)/account/login/page.tsx`, `src/components/site/NewsletterForm.tsx`, `src/app/(site)/cart/page.tsx`

- [ ] **Step 1: Associate labels** — give each bare input a real label: either a `<label htmlFor="id">` + matching `id`, or (where the design has no visible label) an `aria-label`. Targets: WaitlistForm email (line ~50) + conditional phone (line ~83); login email (line ~41). NewsletterForm already has a proper label — leave it.

- [ ] **Step 2: Announce async status** — wrap each form's success/error message node in a live region. Success/neutral: `role="status" aria-live="polite"`; errors: `role="alert"`. Targets: WaitlistForm message (line ~95), NewsletterForm message (line ~61), login messages (lines ~40/42), cart error (lines ~81–84) and the "Loading cart…" state (`role="status"`).

Example (login):

```tsx
{error && <p role="alert" className="...text-error">{error}</p>}
{notice && <p role="status" aria-live="polite" className="...">{notice}</p>}
```

- [ ] **Step 3: Verify** — Run: `npm run lint` → the label-related jsx-a11y errors for these files are gone.

- [ ] **Step 4: Commit**

```bash
git add src/features/shop/WaitlistForm.tsx src/app/\(site\)/account/login/page.tsx src/components/site/NewsletterForm.tsx src/app/\(site\)/cart/page.tsx
git commit -m "$(cat <<'EOF'
fix(a11y): labels + aria-live status regions on storefront forms

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.4: Interactive control states (aria-expanded / pressed / selected)

**Files:**
- Modify: `src/components/site/SiteHeader.tsx` (mobile menu toggle: `aria-expanded={mobileOpen}` + `aria-controls`)
- Modify: `src/features/shop/HeroShowcase.tsx` (color swatches: `aria-pressed` for the active swatch)
- Modify: `src/features/shop/PdpConfigurator.tsx` (step tabs: `role="tab"`/`aria-selected` within a `role="tablist"`; lens cards: `aria-pressed`)
- Modify: `src/app/(site)/quiz/page.tsx` (option buttons: `aria-pressed` for the selected option)
- Modify: `src/features/rx-intake/components/RxTypedValuesStep.tsx` (PD-type toggle: `aria-pressed`)

- [ ] **Step 1: Apply the state attributes** — for each toggle/tab/option button add the attribute reflecting current state (e.g. `aria-pressed={selected === value}` on a swatch; `aria-expanded={open}` + `aria-controls="mobile-menu"` on the hamburger with `id="mobile-menu"` on the panel). Use a proper `tablist`/`tab`/`tabpanel` triplet for the PDP steps if they behave as tabs; otherwise `aria-pressed` is sufficient.

- [ ] **Step 2: Verify** — Run: `npm run lint`; `npm run dev` and toggle each control with a screen reader or the browser a11y inspector to confirm state is announced.

- [ ] **Step 3: Commit**

```bash
git add src/components/site/SiteHeader.tsx src/features/shop/HeroShowcase.tsx src/features/shop/PdpConfigurator.tsx src/app/\(site\)/quiz/page.tsx src/features/rx-intake/components/RxTypedValuesStep.tsx
git commit -m "$(cat <<'EOF'
fix(a11y): announce control state on menu, swatches, PDP tabs, quiz, PD toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.5: Decorative images/emoji hidden; gallery thumbnails labeled

**Files:**
- Modify: `src/features/shop/ProductGallery.tsx` (decorative `alt=""` thumbnails → `aria-hidden`; thumbnail BUTTONS get descriptive `aria-label`)
- Modify: `src/features/cart/CartLineItem.tsx` (decorative image `aria-hidden`)
- Modify: any emoji-in-button (`HeroShowcase`, `quiz/page.tsx`, `RxTypedValuesStep`) → wrap emoji in `<span aria-hidden="true">…</span>`

- [ ] **Step 1: Apply** — add `aria-hidden="true"` to purely decorative images/SVGs/emoji; give each gallery thumbnail button `aria-label={`View image ${i + 1} of ${images.length}`}`.

- [ ] **Step 2: Verify** — Run: `npm run lint` → clean; confirm no remaining jsx-a11y errors across the whole repo: `npm run lint` exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/shop/ProductGallery.tsx src/features/cart/CartLineItem.tsx src/features/shop/HeroShowcase.tsx src/app/\(site\)/quiz/page.tsx src/features/rx-intake/components/RxTypedValuesStep.tsx
git commit -m "$(cat <<'EOF'
fix(a11y): hide decorative images/emoji, label gallery thumbnails

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.6: Contrast token fixes

**Files:**
- Modify: `src/app/globals.css` (darken failing tokens so text pairs meet 4.5:1)

- [ ] **Step 1: Fix the failing pairs** — `--color-muted-soft` (#8a96a4) on `--color-base` (#f2f5f8) is ~1.8:1. Darken `--color-muted-soft` until body text on `base` and `base-deeper` meets **4.5:1** (try ~`#5b6675` and re-check). Re-evaluate `--color-tortoise` usage for small text — where it's used as text on a light bg, swap to `ink`/`accent` or darken; keep it for decorative/large display only. Keep the brand direction (cool grays + tortoise accent).

- [ ] **Step 2: Verify contrast** — check each changed pair with a contrast formula (WebAIM/Lighthouse). Document the before/after ratios in the commit body. Run `npm run dev` and eyeball `/`, `/shop`, a PDP — the palette should still read as GlassyVision.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
fix(a11y): darken low-contrast text tokens to meet WCAG AA 4.5:1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.7: Final a11y verification (axe spot-check) + full-suite gate

- [ ] **Step 1: Build + full suite** — Run: `npm run lint && npm test && npm run build`. Expected: lint clean (jsx-a11y enabled), all unit tests green, build compiles.

- [ ] **Step 2: axe spot-check** — `npm run dev`, then run axe (browser extension or the existing Playwright harness) against home `/`, a PDP `/p/<handle>`, `/cart`, `/account/login`, and an Rx intake page. Record that there are no critical/serious violations; capture before/after screenshots of the contrast fix for the review.

- [ ] **Step 3:** No code commit unless the spot-check surfaces a fix; if it does, fix + commit, then re-run Step 1.

**▶ After Task 4.7: dispatch an external code review** of Feature 4.

---

# Final integration gate (after all four features + their reviews)

- [ ] **Full verification** — Run: `npm run lint && npm test && npm run build`. All green; capture the test count (should be > 402).
- [ ] **Migration sanity** — re-read `00039`–`00043` in order; confirm no number collision and each is idempotent (`if not exists` / `add value if not exists`). If Docker is available, `supabase db reset` to confirm they apply cleanly; otherwise note "validated by inspection" per the runbook.
- [ ] **Finish the branch** — use superpowers:finishing-a-development-branch to present merge/PR options for `feature/priority2-polish`.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Emails (gap-fill, no Shopify dup, rx_received + rx_approved, idempotent, best-effort) → Tasks 1.1–1.6. ✓
- Optical: add-range, axis/cyl cross-field, high-index, anisometropia → 2.2; prism end-to-end (migration/form/validation/work-order) → 2.1, 2.3, 2.4, 2.5; warnings on admin review → 2.6. ✓ (segment-height deferred per spec.)
- Webhook poison-pill cap → 3.1; guest dedupe (index + atomic write + claim consolidation) → 3.2, 3.3, 3.4. ✓
- A11y: jsx-a11y tooling → 4.1; skip-link/landmark/headings → 4.2; labels + aria-live → 4.3; control states → 4.4; decorative hiding + thumbnail labels → 4.5; contrast → 4.6; axe gate → 4.7. ✓
- Cross-cutting: TDD on all pure logic; external review after each feature (▶ markers); migrations validated-by-inspection note; compliance untouched (optical warnings advisory only). ✓

**Placeholder scan:** the only deliberately-deferred specifics are UI-edit details in Feature 4 tasks (verified by lint/axe, not unit tests) and the two test harnesses (1.5/1.6) that say "mirror the existing test mocks" — acceptable because the concrete assertion and wiring code are given; the harness is copy-from-neighbor.

**Type consistency:** `sendOrderEmailOnce` signature is identical in 1.2, 1.5, 1.6. `RxTypedValues` prism fields (`odPrism/osPrism/odBase/osBase`) are consistent across 2.2, 2.3, 2.4. `comm_type` value `'rx_received'` added in 1.1 before first use in 1.2/1.5. RPC name `claim_customers_by_verified_email` consistent across 3.2 and 3.4. Migration numbers `00039`→`00043` are unique and sequential (`00040` = communications-once index added in the Feature 1 review fix).
