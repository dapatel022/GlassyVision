# Rx Reminder Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send automated email reminders to customers who haven't uploaded their Rx, on a day 1/3/7/14/30/60/90 cadence, with idempotency and admin-only manual cancellation. Surface aging awaiting-Rx orders on the admin dashboard for triage.

**Architecture:** A daily Vercel Cron hits `/api/cron/rx-reminder` at 09:00 UTC. The handler queries orders with `rx_status='awaiting_upload'`, computes "days since order" per row, looks up the next due reminder day (with first-send catch-up rule), and sends via Resend. Idempotency comes from a `communications` row per (order, reminder_day). A new `/admin/awaiting-rx` page lists stalled orders with last-reminder timestamp + a count tile on `/admin`.

**Tech Stack:** Next.js Route Handler, Resend SDK (already in deps), Supabase Postgres + admin client, Vercel Cron, vitest.

**Policy reminders (from CLAUDE.md / project memory):**
- Cadence: day 1, 3, 7, 14, 30, 60, 90 (after `orders.created_at`).
- Never auto-cancel — admin always decides.
- First-send catch-up: if a stale order (e.g., 20 days) has zero reminders, send only the *most current* one (day 14), not the entire backlog.

---

## File Structure

**Create:**
- `supabase/migrations/00020_communications_metadata.sql` — adds `metadata jsonb` column to `communications`.
- `src/lib/email/resend.ts` — thin wrapper around Resend SDK + DB-row insertion.
- `src/lib/email/templates/rx-reminder.ts` — pure function: `(input) → { subject, html, text }`.
- `src/lib/rx-reminder/select-next.ts` — pure decision function `(daysSinceOrder, sentDays) → number | null`.
- `src/app/api/cron/rx-reminder/route.ts` — cron handler.
- `src/features/admin/awaiting-rx/queries.ts` — `listAwaitingRx()`.
- `src/app/admin/awaiting-rx/page.tsx` — list page.
- `tests/lib/rx-reminder/select-next.test.ts`
- `tests/lib/email/rx-reminder-template.test.ts`
- `tests/api/cron/rx-reminder.test.ts`

**Modify:**
- `vercel.json` — add cron entry.
- `src/app/admin/page.tsx` — add "Awaiting Rx > 14 days" tile + link to new page.

---

## Task 1: DB migration — add `metadata` to communications

**Files:**
- Create: `supabase/migrations/00020_communications_metadata.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table communications
  add column metadata jsonb not null default '{}'::jsonb;

-- Idempotency for rx_reminder: ensure we never send the same (order, day) twice.
create unique index uniq_rx_reminder_per_order_day
  on communications(order_id, ((metadata ->> 'reminder_day')::int))
  where type = 'rx_reminder' and direction = 'outbound';
```

- [ ] **Step 2: Apply locally**

Run: `npx supabase db reset`
Expected: reset completes, no SQL errors. (`db reset` re-applies all migrations.)

- [ ] **Step 3: Regenerate Supabase types**

Run: `npx supabase gen types typescript --local > src/lib/supabase/types.ts`
Expected: `metadata: Json` appears under `communications` Row/Insert/Update types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00020_communications_metadata.sql src/lib/supabase/types.ts
git commit -m "feat(db): add communications.metadata + rx_reminder uniqueness index"
```

---

## Task 2: Pure reminder-selection logic + test

**Files:**
- Create: `src/lib/rx-reminder/select-next.ts`
- Create: `tests/lib/rx-reminder/select-next.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/rx-reminder/select-next.test.ts
import { describe, it, expect } from 'vitest';
import { selectNextReminderDay, RX_REMINDER_CADENCE } from '@/lib/rx-reminder/select-next';

describe('selectNextReminderDay', () => {
  it('returns null when order is < 1 day old', () => {
    expect(selectNextReminderDay(0, [])).toBeNull();
  });

  it('returns 1 for a fresh 1-day-old order with no prior sends', () => {
    expect(selectNextReminderDay(1, [])).toBe(1);
  });

  it('first-send catch-up: 20-day-old order with no sends gets day 14, not day 1', () => {
    expect(selectNextReminderDay(20, [])).toBe(14);
  });

  it('marches forward normally after a prior send', () => {
    expect(selectNextReminderDay(8, [1, 3])).toBe(7);
  });

  it('returns null when caller is past the latest cadence (90)', () => {
    expect(selectNextReminderDay(120, [1, 3, 7, 14, 30, 60, 90])).toBeNull();
  });

  it('returns null when not yet at the next cadence', () => {
    expect(selectNextReminderDay(5, [1, 3])).toBeNull();
  });

  it('exposes the cadence array', () => {
    expect(RX_REMINDER_CADENCE).toEqual([1, 3, 7, 14, 30, 60, 90]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- select-next`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/rx-reminder/select-next.ts
export const RX_REMINDER_CADENCE = [1, 3, 7, 14, 30, 60, 90] as const;

export function selectNextReminderDay(
  daysSinceOrder: number,
  sentDays: number[],
): number | null {
  if (daysSinceOrder < 1) return null;

  if (sentDays.length === 0) {
    // First-send catch-up: send the most-current reminder, skip the backlog.
    for (let i = RX_REMINDER_CADENCE.length - 1; i >= 0; i--) {
      const d = RX_REMINDER_CADENCE[i];
      if (d <= daysSinceOrder) return d;
    }
    return null;
  }

  const lastSent = Math.max(...sentDays);
  for (const d of RX_REMINDER_CADENCE) {
    if (d > lastSent && d <= daysSinceOrder) return d;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- select-next`
Expected: PASS, 7/7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rx-reminder/select-next.ts tests/lib/rx-reminder/select-next.test.ts
git commit -m "feat(rx-reminder): add pure cadence selector with first-send catch-up"
```

---

## Task 3: Email template + test

**Files:**
- Create: `src/lib/email/templates/rx-reminder.ts`
- Create: `tests/lib/email/rx-reminder-template.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/email/rx-reminder-template.test.ts
import { describe, it, expect } from 'vitest';
import { renderRxReminder } from '@/lib/email/templates/rx-reminder';

describe('renderRxReminder', () => {
  const base = {
    orderNumber: 'GV-1001',
    customerEmail: 'c@x.com',
    rxUrl: 'https://glassyvision.com/rx/GV-1001?token=abc&exp=123',
  };

  it('returns subject, html, and text', () => {
    const out = renderRxReminder({ ...base, reminderDay: 1 });
    expect(out.subject).toBeTruthy();
    expect(out.html).toContain('GV-1001');
    expect(out.html).toContain(base.rxUrl);
    expect(out.text).toContain(base.rxUrl);
  });

  it('day 1 copy is friendly', () => {
    const out = renderRxReminder({ ...base, reminderDay: 1 });
    expect(out.subject.toLowerCase()).toContain('prescription');
    expect(out.html).not.toContain('cancel');
  });

  it('day 60 copy is more urgent and notes admin will follow up', () => {
    const out = renderRxReminder({ ...base, reminderDay: 60 });
    expect(out.subject.toLowerCase()).toMatch(/still|reminder|holding/);
    expect(out.html.toLowerCase()).toContain('reach out');
  });

  it('never uses the LENSABL name (CLAUDE.md rule)', () => {
    const out = renderRxReminder({ ...base, reminderDay: 14 });
    expect(out.html.toLowerCase()).not.toContain('lensabl');
    expect(out.text.toLowerCase()).not.toContain('lensabl');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rx-reminder-template`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/email/templates/rx-reminder.ts
export interface RxReminderInput {
  orderNumber: string;
  customerEmail: string;
  rxUrl: string;
  reminderDay: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function copyForDay(day: number): { subject: string; lead: string; outro: string } {
  if (day <= 3) {
    return {
      subject: `Your GlassyVision order ${'{orderNumber}'} — upload your prescription`,
      lead: `Quick reminder — we still need your prescription to start making your lenses.`,
      outro: `Takes about a minute. We'll hold your order until you upload.`,
    };
  }
  if (day <= 14) {
    return {
      subject: `Still holding order ${'{orderNumber}'} for your prescription`,
      lead: `Your order is on hold — we just need a photo or PDF of your prescription before we can make your lenses.`,
      outro: `If you've lost it, ask your eye doctor for a copy (they're required to give you one).`,
    };
  }
  if (day <= 60) {
    return {
      subject: `Reminder: order ${'{orderNumber}'} is still waiting on your prescription`,
      lead: `It's been a while since you placed order ${'{orderNumber}'}. We're still holding it for you.`,
      outro: `If something's blocking you, reply to this email and we'll figure it out together.`,
    };
  }
  return {
    subject: `Order ${'{orderNumber}'}: still holding — please upload or let us know`,
    lead: `We're still holding order ${'{orderNumber}'}. If you don't intend to complete it, reply and our team will reach out about a refund.`,
    outro: `Otherwise, upload your prescription any time using the link below.`,
  };
}

function fillTemplate(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export function renderRxReminder(input: RxReminderInput): RenderedEmail {
  const copy = copyForDay(input.reminderDay);
  const vars = { orderNumber: input.orderNumber };
  const subject = fillTemplate(copy.subject, vars);
  const lead = fillTemplate(copy.lead, vars);
  const outro = fillTemplate(copy.outro, vars);

  const html = `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.01em;">GlassyVision</h1>
  <p>${lead}</p>
  <p style="margin: 24px 0;">
    <a href="${input.rxUrl}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 13px;">Upload your prescription</a>
  </p>
  <p style="color: #666;">${outro}</p>
  <p style="color: #999; font-size: 12px; margin-top: 32px;">Order ${input.orderNumber} · ${input.customerEmail}</p>
</body></html>`;

  const text = `${lead}\n\nUpload here: ${input.rxUrl}\n\n${outro}\n\nOrder ${input.orderNumber}`;

  return { subject, html, text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rx-reminder-template`
Expected: PASS, 4/4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/rx-reminder.ts tests/lib/email/rx-reminder-template.test.ts
git commit -m "feat(email): add Rx reminder template with day-tiered copy"
```

---

## Task 4: Resend client wrapper

**Files:**
- Create: `src/lib/email/resend.ts`

(No test for the wrapper itself — it's a thin shim that delegates to the Resend SDK. The cron route test in Task 5 mocks this.)

- [ ] **Step 1: Implement**

```ts
// src/lib/email/resend.ts
import { Resend } from 'resend';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

let client: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const c = getClient();
  if (!c) {
    // Dev / unconfigured: log instead of sending. Caller should still record a
    // communications row marked status='failed' so we can see what would have gone.
    console.log('[email:stub] would send', { to: input.to, subject: input.subject });
    return { success: false, error: 'RESEND_API_KEY not set' };
  }

  const from = process.env.RESEND_FROM_EMAIL ?? 'hello@glassyvision.com';

  try {
    const { data, error } = await c.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, providerMessageId: data?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/resend.ts
git commit -m "feat(email): add Resend client wrapper with no-key fallback"
```

---

## Task 5: Cron route handler + test

**Files:**
- Create: `src/app/api/cron/rx-reminder/route.ts`
- Create: `tests/api/cron/rx-reminder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/cron/rx-reminder.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmailMock = vi.fn();
vi.mock('@/lib/email/resend', () => ({ sendEmail: sendEmailMock }));

const generateRxTokenMock = vi.fn(() => ({ token: 'tok', exp: 123 }));
vi.mock('@/features/rx-intake/lib/rx-token', () => ({ generateRxToken: generateRxTokenMock }));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

describe('rx-reminder cron route', () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ success: true, providerMessageId: 'msg-1' });
    mockFrom.mockReset();
    process.env.CRON_SECRET = 'test-secret';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://glassyvision.com';
  });

  afterEach?.(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    process.env.NEXT_PUBLIC_BASE_URL = ORIGINAL_BASE_URL;
  });

  function buildRequest(authHeader?: string) {
    const headers = new Headers();
    if (authHeader) headers.set('authorization', authHeader);
    return new Request('https://x/api/cron/rx-reminder', { headers });
  }

  it('rejects unauthorized requests', async () => {
    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('sends a day-1 reminder for an order created 1 day ago with no prior sends', async () => {
    const oneDayAgo = new Date(Date.now() - 1.1 * 24 * 60 * 60 * 1000).toISOString();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{
                id: 'o-1', shopify_order_number: 'GV-1001',
                customer_email: 'c@x.com', created_at: oneDayAgo,
              }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'communications') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          insert: vi.fn(() => Promise.resolve({ error: null })),
        };
      }
      return {};
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('c@x.com');
  });

  it('skips orders that are not yet due', async () => {
    const halfDayAgo = new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000).toISOString();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{
                id: 'o-1', shopify_order_number: 'GV-1001',
                customer_email: 'c@x.com', created_at: halfDayAgo,
              }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'communications') {
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
        };
      }
      return {};
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rx-reminder.test`
Expected: FAIL — module `@/app/api/cron/rx-reminder/route` not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/cron/rx-reminder/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { renderRxReminder } from '@/lib/email/templates/rx-reminder';
import { selectNextReminderDay } from '@/lib/rx-reminder/select-next';
import { generateRxToken } from '@/features/rx-intake/lib/rx-token';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (expected && got !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://glassyvision.com';
  const now = Date.now();

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, shopify_order_number, customer_email, created_at')
    .eq('rx_status', 'awaiting_upload');

  if (ordersError) {
    return NextResponse.json({ error: 'orders query failed' }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ orderId: string; error: string }> = [];

  for (const order of orders ?? []) {
    const created = new Date(order.created_at).getTime();
    const daysSinceOrder = Math.floor((now - created) / (24 * 60 * 60 * 1000));

    const { data: priorComms } = await supabase
      .from('communications')
      .select('metadata')
      .eq('order_id', order.id)
      .eq('type', 'rx_reminder');

    const sentDays: number[] = (priorComms ?? [])
      .map((c) => Number((c.metadata as { reminder_day?: number } | null)?.reminder_day))
      .filter((n) => Number.isFinite(n));

    const next = selectNextReminderDay(daysSinceOrder, sentDays);
    if (next === null) {
      skipped++;
      continue;
    }

    const { token, exp } = generateRxToken(order.shopify_order_number);
    const rxUrl = `${baseUrl}/rx/${order.shopify_order_number}?token=${token}&exp=${exp}`;
    const rendered = renderRxReminder({
      orderNumber: order.shopify_order_number,
      customerEmail: order.customer_email,
      rxUrl,
      reminderDay: next,
    });

    const result = await sendEmail({
      to: order.customer_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    const { error: insertError } = await supabase.from('communications').insert({
      order_id: order.id,
      customer_email: order.customer_email,
      type: 'rx_reminder',
      provider: 'resend',
      provider_message_id: result.providerMessageId ?? null,
      subject: rendered.subject,
      status: result.success ? 'sent' : 'failed',
      sent_at: result.success ? new Date().toISOString() : null,
      metadata: { reminder_day: next },
    });

    if (insertError) {
      errors.push({ orderId: order.id, error: insertError.message });
      continue;
    }

    if (result.success) sent++;
    else errors.push({ orderId: order.id, error: result.error ?? 'send failed' });
  }

  return NextResponse.json({ success: true, sent, skipped, errors });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rx-reminder.test`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/rx-reminder/route.ts tests/api/cron/rx-reminder.test.ts
git commit -m "feat(cron): add rx-reminder daily cron with idempotency + auth"
```

---

## Task 6: Wire Vercel Cron schedule

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add the cron entry**

Replace the `crons` array in `vercel.json` with:

```json
{
  "crons": [
    {
      "path": "/api/cron/reconcile",
      "schedule": "0 5 * * *"
    },
    {
      "path": "/api/cron/rx-reminder",
      "schedule": "0 9 * * *"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore(vercel): schedule rx-reminder cron at 09:00 UTC daily"
```

---

## Task 7: Admin awaiting-Rx query helper

**Files:**
- Create: `src/features/admin/awaiting-rx/queries.ts`

- [ ] **Step 1: Implement**

```ts
// src/features/admin/awaiting-rx/queries.ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AwaitingRxOrder {
  id: string;
  shopifyOrderNumber: string;
  customerEmail: string;
  createdAt: string;
  daysSinceOrder: number;
  remindersSent: number;
  lastReminderAt: string | null;
  lastReminderDay: number | null;
}

export async function listAwaitingRx(): Promise<AwaitingRxOrder[]> {
  const supabase = createAdminClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, shopify_order_number, customer_email, created_at')
    .eq('rx_status', 'awaiting_upload')
    .order('created_at', { ascending: true });

  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: comms } = await supabase
    .from('communications')
    .select('order_id, sent_at, metadata')
    .in('order_id', orderIds)
    .eq('type', 'rx_reminder')
    .order('sent_at', { ascending: false });

  const byOrder = new Map<string, { count: number; lastAt: string | null; lastDay: number | null }>();
  for (const c of comms ?? []) {
    const cur = byOrder.get(c.order_id!) ?? { count: 0, lastAt: null, lastDay: null };
    cur.count += 1;
    if (!cur.lastAt && c.sent_at) {
      cur.lastAt = c.sent_at;
      cur.lastDay = (c.metadata as { reminder_day?: number } | null)?.reminder_day ?? null;
    }
    byOrder.set(c.order_id!, cur);
  }

  const now = Date.now();
  return orders.map((o) => {
    const meta = byOrder.get(o.id) ?? { count: 0, lastAt: null, lastDay: null };
    const days = Math.floor((now - new Date(o.created_at).getTime()) / (24 * 60 * 60 * 1000));
    return {
      id: o.id,
      shopifyOrderNumber: o.shopify_order_number,
      customerEmail: o.customer_email,
      createdAt: o.created_at,
      daysSinceOrder: days,
      remindersSent: meta.count,
      lastReminderAt: meta.lastAt,
      lastReminderDay: meta.lastDay,
    };
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/awaiting-rx/queries.ts
git commit -m "feat(admin): add listAwaitingRx query helper"
```

---

## Task 8: Admin awaiting-Rx page + dashboard tile

**Files:**
- Create: `src/app/admin/awaiting-rx/page.tsx`
- Modify: `src/app/admin/page.tsx` (extend stats + sections)

- [ ] **Step 1: Create the page**

```tsx
// src/app/admin/awaiting-rx/page.tsx
import { listAwaitingRx } from '@/features/admin/awaiting-rx/queries';

export const dynamic = 'force-dynamic';

export default async function AwaitingRxPage() {
  const rows = await listAwaitingRx();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-1">
          Orders awaiting Rx
        </h1>
        <p className="font-serif italic text-muted text-sm">
          Customers who haven&apos;t uploaded yet. Reminders run daily; aging rows may need a manual call.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted">No orders awaiting Rx upload.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-line rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-base-deeper text-xs font-mono uppercase tracking-wider text-muted-soft">
              <tr>
                <th className="text-left px-4 py-3">Order</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-right px-4 py-3">Days</th>
                <th className="text-right px-4 py-3">Reminders</th>
                <th className="text-left px-4 py-3">Last reminder</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono">{r.shopifyOrderNumber}</td>
                  <td className="px-4 py-3">{r.customerEmail}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.daysSinceOrder >= 30 ? 'font-bold text-error' : ''}`}>
                    {r.daysSinceOrder}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.remindersSent}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.lastReminderAt
                      ? `Day ${r.lastReminderDay} · ${new Date(r.lastReminderAt).toLocaleDateString()}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the dashboard tile + section link**

In `src/app/admin/page.tsx`, modify `getStats()` to include an aging count, and add the new section.

Replace the `Promise.all` block (currently 7 queries) with:

```ts
  const [
    allRxFiles, reviewedFileIds, lowStock, openReturns,
    ordersAwaitingRx, ordersAwaitingRxAged, activeDrops, activeLabJobs,
  ] = await Promise.all([
    supabase.from('rx_files').select('id').is('deleted_at', null),
    supabase.from('rx_reviews').select('rx_file_id'),
    supabase.from('inventory_pool').select('id, pool_quantity, threshold_alert'),
    supabase.from('returns').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('rx_status', 'awaiting_upload'),
    supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('rx_status', 'awaiting_upload')
      .lt('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('drops').select('id', { count: 'exact', head: true }).eq('state', 'live'),
    supabase.from('lab_jobs').select('id', { count: 'exact', head: true }).neq('column', 'ship'),
  ]);
```

And update the returned `stats` array to add a new tile right after the existing `Orders awaiting Rx upload` entry:

```ts
    { label: 'Awaiting Rx > 14 days', value: ordersAwaitingRxAged.count ?? 0, href: '/admin/awaiting-rx' },
```

Then add to the `SECTIONS` constant a new entry:

```ts
  { title: 'Awaiting Rx', description: 'Customers who haven\'t uploaded yet. Aging rows need triage.', href: '/admin/awaiting-rx' },
```

- [ ] **Step 3: Verify lint + types**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Manual smoke (skip if no time)**

Run: `npm run demo:reset && npm run dev`
Visit `/admin/awaiting-rx` as a founder/reviewer. Expect: at least one row from the seed (GV-1001 is in `awaiting_upload` state per the audit).
Visit `/admin`. Expect: new "Awaiting Rx > 14 days" tile and "Awaiting Rx" section card.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/awaiting-rx/page.tsx src/app/admin/page.tsx
git commit -m "feat(admin): add awaiting-Rx triage page + aging dashboard tile"
```

---

## Self-Review

**Spec coverage:**
- Cadence day 1/3/7/14/30/60/90 — Task 2 ✓
- Idempotency (no double-send) — Task 1 (unique index) + Task 5 (sentDays check) ✓
- No auto-cancel — verified: nothing in this plan modifies `orders` state or refunds ✓
- First-send catch-up rule — Task 2 test cases ✓
- Admin triage surface — Tasks 7 + 8 ✓
- Resend integration — Task 4 ✓
- Cron auth via `CRON_SECRET` — Task 5 ✓
- LENSABL-name-free template — Task 3 test ✓

**Placeholder scan:** none — every step shows the full code.

**Type consistency:** `selectNextReminderDay`, `RX_REMINDER_CADENCE`, `renderRxReminder`, `sendEmail`, and `listAwaitingRx` signatures are referenced consistently across tasks 2-8.

**Out of scope (intentionally):**
- Customer-side "stop sending me reminders" link (would need a customer auth or unique unsub token; deferred until /account/* exists).
- SMS / push channels — schema supports them but Resend-only for now.
- Failure escalation (e.g., bounce → admin alert) — `communications.status='bounced'` is captured but no notification path; revisit when Resend webhook ingestion lands.
