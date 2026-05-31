# Customer Accounts (Subscription-Aware) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the customer identity foundation — Supabase Auth magic-link, a `customers.auth_user_id` link, a token-based post-purchase claim flow, customer RLS, and a GDPR-vs-retention deletion executor — so the subscription core can sit on real customer accounts.

**Architecture:** Customers authenticate via Supabase Auth magic-link and get an `auth.users` row with **no `profiles` row** (so staff middleware rejects them automatically). A new nullable `customers.auth_user_id` links the CRM row to the identity. A stateless HMAC claim token (mirroring `rx-token.ts`) binds a customer record to whoever redeems it. All customer reads go through new RLS policies; all writes stay service-role.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript, Supabase (Postgres + Auth), Vitest, `@supabase/ssr`.

**Reference patterns:** HMAC token = `src/features/rx-intake/lib/rx-token.ts`; staff middleware = `src/lib/auth/middleware.ts`; SSR auth client = `src/lib/supabase/server.ts`; service-role client = `src/lib/supabase/admin.ts`; RLS migration = `supabase/migrations/00025_rx_files_rls.sql`; webhook switch = `src/app/api/shopify/webhooks/route.ts`; page convention = `src/app/login/page.tsx`.

**Spec:** `docs/superpowers/specs/2026-05-31-customer-accounts-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/00027_customer_accounts.sql` — `auth_user_id` column, index, `current_customer_id()` helper, customer self-read RLS.
- `src/lib/auth/claim-token.ts` — stateless HMAC claim token (sign/verify/parse/build-url).
- `src/lib/auth/customer.ts` — `getCurrentCustomer()`.
- `src/features/account/actions/claim-account.ts` — `claimAccount()` server action.
- `src/features/account/actions/resend-claim.ts` — `resendClaimLink()` server action.
- `src/features/account/actions/anonymize-customer.ts` — `anonymizeCustomer()`.
- `src/lib/email/claim-template.ts` — claim email HTML.
- `src/app/(site)/account/login/page.tsx` — magic-link entry (client).
- `src/app/(site)/account/auth/callback/route.ts` — magic-link code exchange.
- `src/app/(site)/account/auth/signout/route.ts` — sign out.
- `src/app/(site)/account/claim/page.tsx` — claim handler (server).
- Tests under `tests/lib/auth/`, `tests/features/account/`, `tests/api/shopify/webhooks/`.

**Modify:**
- `src/app/(site)/account/page.tsx` — **already exists as a placeholder** ("Account dashboard is coming with Drop Nº 01"); replace its body with the authenticated landing. Do NOT create `src/app/account/page.tsx` — it would collide on the `/account` URL with this `(site)` route-group page.
- `src/app/api/shopify/webhooks/route.ts` — add `customers/redact` + `shop/redact` cases.
- `src/app/thanks/[orderId]/page.tsx` — add "create your account" CTA with a generated claim link.

> **Existing scaffold note:** `src/app/(site)/account/page.tsx`, `account/orders/page.tsx`, and `account/orders/[id]/page.tsx` already exist as static "coming soon" placeholders (no auth, no logic, no Lensabl refs). All new account routes go UNDER `src/app/(site)/account/` to reuse the site layout and avoid a route collision. The `orders/*` placeholders stay as-is (order history is deferred per spec §7).

---

## Task 1: Migration — `auth_user_id`, helper, customer RLS

**Files:**
- Create: `supabase/migrations/00027_customer_accounts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Customer accounts foundation (sub-project 0).
-- Links the CRM `customers` row to a Supabase Auth identity. Customers have an
-- auth.users row but NO profiles row, so staff middleware (getCurrentUser) keeps
-- rejecting them. This is the first customer-facing RLS in the codebase.

alter table customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_customers_auth_user_id
  on customers(auth_user_id)
  where auth_user_id is not null;

-- Helper: the customers.id owned by the current auth user (null for staff/anon).
create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from customers where auth_user_id = auth.uid()
$$;

-- Customers read ONLY their own row. Staff/app writes go through the
-- service-role client (bypasses RLS); this policy is the customer read path +
-- defense in depth. Mutations have no customer/anon policy → denied by default.
alter table customers enable row level security;

drop policy if exists "Customer reads own row" on customers;
create policy "Customer reads own row"
  on customers for select
  using (auth_user_id = auth.uid());
```

- [ ] **Step 2: Validate the migration applies**

Run: `supabase db reset`
Expected: all migrations apply through `00027` with no error. (If Docker is unavailable, validate by SQL review and run `supabase db reset` before deploy — see the hardening-plan caveat.)

- [ ] **Step 3: Regenerate Supabase types**

Run: `supabase gen types typescript --local > src/lib/supabase/types.ts`
Expected: `customers` row type now includes `auth_user_id: string | null`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00027_customer_accounts.sql src/lib/supabase/types.ts
git commit -m "feat(accounts): add customers.auth_user_id, current_customer_id(), customer RLS"
```

---

## Task 2: Claim-token library

**Files:**
- Create: `src/lib/auth/claim-token.ts`
- Test: `tests/lib/auth/claim-token.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { generateClaimToken, verifyClaimToken, buildClaimUrl } from '@/lib/auth/claim-token';

beforeEach(() => {
  process.env.CLAIM_TOKEN_SECRET = 'test-secret';
});

describe('claim-token', () => {
  it('verifies a freshly generated token', () => {
    const { token, exp } = generateClaimToken('cust-1');
    expect(verifyClaimToken('cust-1', token, exp)).toBe(true);
  });

  it('rejects a token for a different customer id', () => {
    const { token, exp } = generateClaimToken('cust-1');
    expect(verifyClaimToken('cust-2', token, exp)).toBe(false);
  });

  it('rejects an expired token', () => {
    const { token } = generateClaimToken('cust-1');
    expect(verifyClaimToken('cust-1', token, Date.now() - 1000)).toBe(false);
  });

  it('rejects a tampered token', () => {
    const { exp } = generateClaimToken('cust-1');
    expect(verifyClaimToken('cust-1', 'deadbeef', exp)).toBe(false);
  });

  it('builds a claim URL with cid, token and exp', () => {
    const url = buildClaimUrl('cust-1', 'https://glassyvision.com');
    expect(url).toMatch(/^https:\/\/glassyvision\.com\/account\/claim\?cid=cust-1&token=[a-f0-9]+&exp=\d+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/auth/claim-token.test.ts`
Expected: FAIL — module `@/lib/auth/claim-token` not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_EXPIRY_DAYS = 90;

function getSecret(): string {
  const secret = process.env.CLAIM_TOKEN_SECRET;
  if (!secret) throw new Error('CLAIM_TOKEN_SECRET is not set');
  return secret;
}

export function generateClaimToken(
  customerId: string,
  expiryDays: number = DEFAULT_EXPIRY_DAYS,
): { token: string; exp: number } {
  const exp = Date.now() + expiryDays * 24 * 60 * 60 * 1000;
  const token = createHmac('sha256', getSecret())
    .update(`${customerId}:${exp}`, 'utf-8')
    .digest('hex');
  return { token, exp };
}

export function verifyClaimToken(customerId: string, token: string, exp: number): boolean {
  if (!customerId || !token || !exp) return false;
  if (exp < Date.now()) return false;
  try {
    const expected = createHmac('sha256', getSecret())
      .update(`${customerId}:${exp}`, 'utf-8')
      .digest('hex');
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

export function buildClaimUrl(customerId: string, baseUrl: string): string {
  const { token, exp } = generateClaimToken(customerId);
  return `${baseUrl}/account/claim?cid=${customerId}&token=${token}&exp=${exp}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/auth/claim-token.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/claim-token.ts tests/lib/auth/claim-token.test.ts
git commit -m "feat(accounts): stateless HMAC claim token"
```

---

## Task 3: `getCurrentCustomer()` middleware

**Files:**
- Create: `src/lib/auth/customer.ts`
- Test: `tests/lib/auth/customer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const maybeSingle = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => Promise.resolve({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  })),
}));

beforeEach(() => { getUser.mockReset(); maybeSingle.mockReset(); });

describe('getCurrentCustomer', () => {
  it('returns null when not authenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { getCurrentCustomer } = await import('@/lib/auth/customer');
    expect(await getCurrentCustomer()).toBeNull();
  });

  it('returns null when the auth user has no linked customer row', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { getCurrentCustomer } = await import('@/lib/auth/customer');
    expect(await getCurrentCustomer()).toBeNull();
  });

  it('returns the customer when linked', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    maybeSingle.mockResolvedValue({ data: { id: 'cust-1', email: 'a@b.com', first_name: 'A' }, error: null });
    const { getCurrentCustomer } = await import('@/lib/auth/customer');
    const result = await getCurrentCustomer();
    expect(result).toEqual({ id: 'cust-1', email: 'a@b.com', authUserId: 'u-1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/auth/customer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { createServerClient } from '@/lib/supabase/server';

export interface CurrentCustomer {
  id: string;
  email: string;
  authUserId: string;
}

export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: customer } = await supabase
    .from('customers')
    .select('id, email')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!customer) return null;
  return { id: customer.id, email: customer.email, authUserId: user.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/auth/customer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/customer.ts tests/lib/auth/customer.test.ts
git commit -m "feat(accounts): getCurrentCustomer middleware"
```

---

## Task 4: `claimAccount` server action

**Files:**
- Create: `src/features/account/actions/claim-account.ts`
- Test: `tests/features/account/claim-account.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const fromAdmin = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => Promise.resolve({ auth: { getUser } })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: fromAdmin })),
}));
vi.mock('@/lib/auth/claim-token', () => ({
  verifyClaimToken: vi.fn((cid: string) => cid === 'cust-1'),
}));

function installCustomer(row: Record<string, unknown> | null) {
  const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  fromAdmin.mockImplementation((table: string) => {
    if (table === 'customers') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
        update,
      };
    }
    return {};
  });
  return update;
}

beforeEach(() => { getUser.mockReset(); fromAdmin.mockReset(); });

describe('claimAccount', () => {
  it('returns needsAuth when not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: null, flags: {} });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res).toEqual({ status: 'needsAuth' });
  });

  it('rejects an invalid token', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    installCustomer({ id: 'cust-2', email: 'a@b.com', auth_user_id: null, flags: {} });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-2', 'tok', Date.now() + 10000);
    expect(res.status).toBe('error');
  });

  it('binds auth_user_id on a valid claim', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    const update = installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: null, flags: {} });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res.status).toBe('claimed');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ auth_user_id: 'u-1' }));
  });

  it('flags a claim where the auth email differs from the checkout email', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'other@x.com' } }, error: null });
    const update = installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: null, flags: {} });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res.status).toBe('claimed');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      auth_user_id: 'u-1',
      flags: expect.objectContaining({ claim_email_mismatch: true }),
    }));
  });

  it('is idempotent when already claimed by the same user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@b.com' } }, error: null });
    installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: 'u-1', flags: {} });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res.status).toBe('claimed');
  });

  it('rejects when already claimed by a different user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-2', email: 'a@b.com' } }, error: null });
    installCustomer({ id: 'cust-1', email: 'a@b.com', auth_user_id: 'u-1', flags: {} });
    const { claimAccount } = await import('@/features/account/actions/claim-account');
    const res = await claimAccount('cust-1', 'tok', Date.now() + 10000);
    expect(res.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/account/claim-account.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClaimToken } from '@/lib/auth/claim-token';

export type ClaimResult =
  | { status: 'claimed' }
  | { status: 'needsAuth' }
  | { status: 'error'; error: string };

export async function claimAccount(customerId: string, token: string, exp: number): Promise<ClaimResult> {
  if (!verifyClaimToken(customerId, token, exp)) {
    return { status: 'error', error: 'This claim link is invalid or has expired.' };
  }

  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return { status: 'needsAuth' };

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from('customers')
    .select('id, email, auth_user_id, flags')
    .eq('id', customerId)
    .maybeSingle();

  if (!customer) return { status: 'error', error: 'Account not found.' };

  if (customer.auth_user_id) {
    return customer.auth_user_id === user.id
      ? { status: 'claimed' }
      : { status: 'error', error: 'This purchase is already linked to another account.' };
  }

  const flags = (customer.flags as Record<string, unknown>) ?? {};
  const mismatch = (user.email ?? '').toLowerCase() !== (customer.email ?? '').toLowerCase();
  const nextFlags = mismatch ? { ...flags, claim_email_mismatch: true } : flags;

  const { error } = await admin
    .from('customers')
    .update({ auth_user_id: user.id, flags: nextFlags })
    .eq('id', customerId);

  if (error) return { status: 'error', error: 'Could not link your account. Please try again.' };
  return { status: 'claimed' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/account/claim-account.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/account/actions/claim-account.ts tests/features/account/claim-account.test.ts
git commit -m "feat(accounts): claimAccount action (token-based, idempotent, mismatch flag)"
```

---

## Task 5: `anonymizeCustomer` deletion executor

**Files:**
- Create: `src/features/account/actions/anonymize-customer.ts`
- Test: `tests/features/account/anonymize-customer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromAdmin = vi.fn();
const deleteUser = vi.fn(() => Promise.resolve({ error: null }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: fromAdmin, auth: { admin: { deleteUser } } })),
}));

beforeEach(() => { fromAdmin.mockReset(); deleteUser.mockClear(); });

describe('anonymizeCustomer', () => {
  it('scrubs PII, unlinks auth, sets deletion_requested_at, and never touches rx_files', async () => {
    const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    fromAdmin.mockImplementation((table: string) => {
      if (table === 'customers') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'cust-1', auth_user_id: 'u-1' }, error: null }) }) }),
          update,
        };
      }
      throw new Error(`anonymize must not touch table: ${table}`);
    });

    const { anonymizeCustomer } = await import('@/features/account/actions/anonymize-customer');
    const res = await anonymizeCustomer('cust-1');

    expect(res.success).toBe(true);
    const payload = update.mock.calls[0][0];
    expect(payload.email).toMatch(/deleted\.invalid$/);
    expect(payload.first_name).toBe('');
    expect(payload.last_name).toBe('');
    expect(payload.internal_notes).toBeNull();
    expect(payload.auth_user_id).toBeNull();
    expect(payload.deletion_requested_at).toEqual(expect.any(String));
    expect(deleteUser).toHaveBeenCalledWith('u-1');
  });

  it('succeeds (no-op auth delete) when the customer has no linked auth user', async () => {
    const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    fromAdmin.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'cust-1', auth_user_id: null }, error: null }) }) }),
      update,
    }));
    const { anonymizeCustomer } = await import('@/features/account/actions/anonymize-customer');
    const res = await anonymizeCustomer('cust-1');
    expect(res.success).toBe(true);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/account/anonymize-customer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
'use server';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GDPR/CCPA deletion vs FTC 3-year Rx retention: scrub customer PII and remove
 * the auth identity, but NEVER touch rx_files or dispensed-order compliance
 * records — those are retained in restricted storage until the window lapses.
 */
export async function anonymizeCustomer(customerId: string): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  const { data: customer } = await admin
    .from('customers')
    .select('id, auth_user_id')
    .eq('id', customerId)
    .maybeSingle();

  if (!customer) return { success: false, error: 'Customer not found' };

  const { error } = await admin
    .from('customers')
    .update({
      email: `redacted-${customerId}@deleted.invalid`,
      first_name: '',
      last_name: '',
      internal_notes: null,
      auth_user_id: null,
      deletion_requested_at: new Date().toISOString(),
    })
    .eq('id', customerId);

  if (error) return { success: false, error: 'Anonymization failed' };

  if (customer.auth_user_id) {
    await admin.auth.admin.deleteUser(customer.auth_user_id);
  }

  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/account/anonymize-customer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/account/actions/anonymize-customer.ts tests/features/account/anonymize-customer.test.ts
git commit -m "feat(accounts): anonymizeCustomer deletion executor (retains rx_files)"
```

---

## Task 6: `customers/redact` + `shop/redact` webhook handling

**Files:**
- Modify: `src/app/api/shopify/webhooks/route.ts` (add cases in the `switch (topic)` block, after `products/update`)
- Test: `tests/api/shopify/webhooks/customer-redact.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/hmac', () => ({ verifyShopifyWebhook: () => true }));

const maybeSingle = vi.fn();
const fromMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));

const anonymizeCustomer = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/features/account/actions/anonymize-customer', () => ({ anonymizeCustomer }));
vi.mock('@/lib/commerce/sync', () => ({ syncShopifyOrder: vi.fn() }));

function req(topic: string, body: object) {
  return new Request('http://x/api/shopify/webhooks', {
    method: 'POST',
    headers: { 'x-shopify-topic': topic, 'x-shopify-hmac-sha256': 'h', 'x-shopify-webhook-id': `evt-${topic}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  anonymizeCustomer.mockClear();
  maybeSingle.mockReset();
  fromMock.mockImplementation((table: string) => {
    if (table === 'webhook_events') {
      return {
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'e-1' }, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    if (table === 'customers') {
      return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    }
    return {};
  });
});

describe('customers/redact webhook', () => {
  it('anonymizes the matching customer by shopify_customer_id', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'cust-1' }, error: null });
    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(req('customers/redact', { customer: { id: 555 } }) as never);
    expect(res.status).toBe(200);
    expect(anonymizeCustomer).toHaveBeenCalledWith('cust-1');
  });

  it('succeeds without error when no matching customer exists', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(req('customers/redact', { customer: { id: 999 } }) as never);
    expect(res.status).toBe(200);
    expect(anonymizeCustomer).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/shopify/webhooks/customer-redact.test.ts`
Expected: FAIL — `customers/redact` falls into the `default` branch; `anonymizeCustomer` not called.

- [ ] **Step 3: Add the import and the cases**

At the top of `src/app/api/shopify/webhooks/route.ts`, add:

```typescript
import { anonymizeCustomer } from '@/features/account/actions/anonymize-customer';
```

In the `switch (topic)` block, immediately before `default:`, add:

```typescript
      case 'customers/redact': {
        const shopifyCustomerId = (payload as { customer?: { id?: number } }).customer?.id;
        if (shopifyCustomerId) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id')
            .eq('shopify_customer_id', shopifyCustomerId)
            .maybeSingle();
          if (customer) {
            await anonymizeCustomer(customer.id);
          }
        }
        break;
      }
      case 'shop/redact': {
        // Shop-level erasure request: no per-customer action needed for us.
        console.log('Received shop/redact');
        break;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/shopify/webhooks/customer-redact.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the existing webhook tests to confirm no regression**

Run: `npx vitest run tests/api/shopify/webhooks/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/shopify/webhooks/route.ts tests/api/shopify/webhooks/customer-redact.test.ts
git commit -m "feat(accounts): handle Shopify customers/redact + shop/redact GDPR webhooks"
```

---

## Task 7: Claim email template + `resendClaimLink` action

**Files:**
- Create: `src/lib/email/claim-template.ts`
- Create: `src/features/account/actions/resend-claim.ts`
- Test: `tests/lib/email/claim-template.test.ts`
- Test: `tests/features/account/resend-claim.test.ts`

- [ ] **Step 1: Write the failing template test**

```typescript
import { describe, it, expect } from 'vitest';
import { renderClaimEmail } from '@/lib/email/claim-template';

describe('renderClaimEmail', () => {
  it('includes the claim URL', () => {
    const html = renderClaimEmail('https://glassyvision.com/account/claim?cid=cust-1&token=ab&exp=1');
    expect(html).toContain('https://glassyvision.com/account/claim?cid=cust-1&token=ab&exp=1');
    expect(html).toContain('Manage your');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/email/claim-template.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the template**

```typescript
export function renderClaimEmail(claimUrl: string): string {
  return `<!doctype html>
<html><body style="font-family: sans-serif; color: #1a1a1a;">
  <h1 style="font-size:20px;">Manage your GlassyVision purchase</h1>
  <p>Create your account to track orders, upload your prescription, and manage your subscription.</p>
  <p><a href="${claimUrl}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#fff;text-decoration:none;">Create my account</a></p>
  <p style="font-size:12px;color:#777;">If you didn't make this purchase, you can ignore this email.</p>
</body></html>`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/email/claim-template.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing resend test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }),
}));
const sendEmail = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/lib/email/resend', () => ({ sendEmail }));
vi.mock('@/lib/auth/claim-token', () => ({ buildClaimUrl: () => 'https://glassyvision.com/account/claim?cid=cust-1&token=ab&exp=1' }));

beforeEach(() => { maybeSingle.mockReset(); sendEmail.mockClear(); process.env.NEXT_PUBLIC_SITE_URL = 'https://glassyvision.com'; });

describe('resendClaimLink', () => {
  it('returns a generic ok and sends an email when an unclaimed customer matches', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'cust-1', email: 'a@b.com', auth_user_id: null }, error: null });
    const { resendClaimLink } = await import('@/features/account/actions/resend-claim');
    const res = await resendClaimLink('a@b.com');
    expect(res.success).toBe(true);
    expect(sendEmail).toHaveBeenCalled();
  });

  it('returns the same generic ok WITHOUT sending when no unclaimed match (no account enumeration)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { resendClaimLink } = await import('@/features/account/actions/resend-claim');
    const res = await resendClaimLink('nobody@b.com');
    expect(res.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/features/account/resend-claim.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `resendClaimLink`**

```typescript
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { buildClaimUrl } from '@/lib/auth/claim-token';
import { renderClaimEmail } from '@/lib/email/claim-template';
import { sendEmail } from '@/lib/email/resend';

/**
 * Re-send a claim link to a customer email. Always returns the same generic
 * result regardless of whether a match exists — never reveal account existence.
 */
export async function resendClaimLink(email: string): Promise<{ success: boolean }> {
  const admin = createAdminClient();
  const { data: customer } = await admin
    .from('customers')
    .select('id, email, auth_user_id')
    .eq('email', email)
    .maybeSingle();

  if (customer && !customer.auth_user_id) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://glassyvision.com';
    const claimUrl = buildClaimUrl(customer.id, baseUrl);
    await sendEmail({
      to: customer.email,
      subject: 'Create your GlassyVision account',
      html: renderClaimEmail(claimUrl),
    });
  }

  return { success: true };
}
```

> **Note for the implementer:** confirm `sendEmail`'s exact signature in `src/lib/email/resend.ts` and adjust the call to match (param names/shape). If it differs, update both the mock and the call.

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/features/account/resend-claim.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/lib/email/claim-template.ts src/features/account/actions/resend-claim.ts tests/lib/email/claim-template.test.ts tests/features/account/resend-claim.test.ts
git commit -m "feat(accounts): claim email template + resendClaimLink (no account enumeration)"
```

---

## Task 8: `/account/login` page + magic-link callback route

**Files:**
- Create: `src/app/(site)/account/login/page.tsx`
- Create: `src/app/(site)/account/auth/callback/route.ts`

- [ ] **Step 1: Implement the magic-link login page**

```tsx
'use client';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

export default function AccountLoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createBrowserClient();
    const next = new URLSearchParams(window.location.search).get('next') || '/account';
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/account/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (authError) { setError(authError.message); setLoading(false); return; }
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">GlassyVision<span className="text-accent">.</span></h1>
          <p className="font-serif italic text-muted text-sm mt-2">Your account</p>
        </div>
        {sent ? (
          <p className="text-center text-sm text-ink">Check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-4 py-3 bg-white border border-line text-ink font-sans text-sm focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none" />
            {error && <p className="text-error text-xs font-mono">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase disabled:opacity-50">
              {loading ? 'Sending...' : 'Email me a sign-in link'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Implement the magic-link callback route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/account';

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/account/login?error=auth`);
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run build`
Expected: build compiles; `/account/login` and `/account/auth/callback` appear in the route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/account/login/page.tsx" "src/app/(site)/account/auth/callback/route.ts"
git commit -m "feat(accounts): magic-link login page + auth callback route"
```

---

## Task 9: `/account/claim` page

**Files:**
- Create: `src/app/(site)/account/claim/page.tsx`

- [ ] **Step 1: Implement the claim page (server component)**

```tsx
import { redirect } from 'next/navigation';
import { claimAccount } from '@/features/account/actions/claim-account';

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ cid?: string; token?: string; exp?: string }> }) {
  const { cid, token, exp } = await searchParams;

  if (!cid || !token || !exp) {
    return <ClaimMessage title="Invalid link" body="This claim link is missing information." />;
  }

  const result = await claimAccount(cid, token, Number(exp));

  if (result.status === 'needsAuth') {
    redirect(`/account/login?next=${encodeURIComponent(`/account/claim?cid=${cid}&token=${token}&exp=${exp}`)}`);
  }
  if (result.status === 'claimed') {
    redirect('/account');
  }
  return <ClaimMessage title="Couldn't link your account" body={result.error} />;
}

function ClaimMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-base">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="font-sans text-xl font-black uppercase text-ink">{title}</h1>
        <p className="text-sm text-muted">{body}</p>
        <a href="/account/login" className="text-accent text-sm underline">Go to sign in</a>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run build`
Expected: build compiles; `/account/claim` in the route list.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(site)/account/claim/page.tsx"
git commit -m "feat(accounts): claim page wiring claimAccount + auth redirect"
```

---

## Task 10: `/account` landing page

**Files:**
- Modify: `src/app/(site)/account/page.tsx` (replace the existing "coming soon" placeholder body with this authenticated landing)
- Create: `src/app/(site)/account/auth/signout/route.ts`

- [ ] **Step 1: Replace the placeholder with the authenticated landing (server component)**

```tsx
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth/customer';

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/account/login?next=/account');

  return (
    <main className="min-h-screen bg-base px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="font-sans text-2xl font-black uppercase text-ink">Your account</h1>
          <p className="text-sm text-muted mt-1">{customer.email}</p>
        </header>
        <section className="border border-line bg-white p-6">
          <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Subscription</h2>
          <p className="text-sm text-muted mt-2">Your subscription dashboard will appear here.</p>
        </section>
        <form action="/account/auth/signout" method="post">
          <button type="submit" className="text-xs font-mono text-muted underline">Sign out</button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Implement the sign-out route**

Create `src/app/(site)/account/auth/signout/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/account/login', request.url));
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run build`
Expected: build compiles; `/account` and `/account/auth/signout` in the route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/account/page.tsx" "src/app/(site)/account/auth/signout/route.ts"
git commit -m "feat(accounts): authenticated /account landing + sign out"
```

---

## Task 11: `/thanks` claim CTA

**Files:**
- Modify: `src/app/thanks/[orderId]/page.tsx` (add a CTA; the page already loads the order — reuse its existing customer/order lookup to get the customer id)

- [ ] **Step 1: Read the current page to find the order/customer lookup**

Run: `sed -n '1,80p' src/app/thanks/[orderId]/page.tsx`
Expected: identify where the order (and its `customer_id`) is loaded server-side.

- [ ] **Step 2: Add the claim CTA**

Using the order's `customer_id` already loaded on the page, build the claim link server-side and render a CTA. Add this import:

```typescript
import { buildClaimUrl } from '@/lib/auth/claim-token';
```

And where the order's `customer_id` is in scope, render:

```tsx
{order.customer_id && (
  <a
    href={buildClaimUrl(order.customer_id, process.env.NEXT_PUBLIC_SITE_URL ?? 'https://glassyvision.com')}
    className="inline-block py-3 px-6 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase"
  >
    Create your account
  </a>
)}
```

> **Note for the implementer:** match the exact variable name the page uses for the loaded order row and its `customer_id` field. If the page fetches via the order number rather than the row, select `customer_id` in that query.

- [ ] **Step 3: Manual verification**

Run: `npm run build`
Expected: build compiles with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/thanks/[orderId]/page.tsx
git commit -m "feat(accounts): claim-your-account CTA on the thanks page"
```

---

## Task 12: Full verification + RLS check + code review

- [ ] **Step 1: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass (baseline 177 + the new account tests).

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: RLS verification (requires Docker/local Supabase)**

Run: `supabase db reset` then, via `psql`, assert with two different `auth.uid()` contexts that a customer can SELECT only their own `customers` row. Document the result. (If Docker is unavailable, mark this as a pre-deploy gate per the hardening-plan caveat.)

- [ ] **Step 4: External code review**

Dispatch a `feature-dev:code-reviewer` subagent over the full diff for this branch. Focus: auth separation (no customer gets a staff role), claim-token security (HMAC, timing-safe, expiry), claim idempotency + the already-claimed-by-another guard, RLS correctness, and that `anonymizeCustomer` never touches `rx_files`. Address findings via TDD before merge.

- [ ] **Step 5: Finish the branch**

Use `superpowers:finishing-a-development-branch` to decide merge/PR.

---

## Self-Review (against the spec)

**Spec coverage:**
- §2 identity/auth (no enum change) → Tasks 1, 3, 8. ✓
- §3 token-based claim + mismatch flag + re-issue → Tasks 2, 4, 7, 9. ✓
- §4 data model + RLS + `current_customer_id()` → Task 1. ✓
- §5 deletion (anonymize, retain Rx) + `customers/redact` → Tasks 5, 6. ✓
- §6 `/account` surface (login, claim, landing) + claim CTA → Tasks 8, 9, 10, 11. ✓
- §8 done-criteria (unit, RLS, integration, auth) → covered across tasks + Task 12. ✓

**Deferred per spec §7 (correctly NOT built):** order history, saved-Rx library, saved addresses, gift UI, admin merge tooling, gating, social/password auth.

**Notes flagged for the implementer (verify exact signatures, not placeholders):** `sendEmail` shape (Task 7), the `/thanks` page's order/customer variable names (Task 11). Both are real integration points called out explicitly rather than guessed.
