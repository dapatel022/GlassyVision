# Back-Office Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 7 findings from the 2026-07-28 back-office audit: stranded approved orders, double-refund race, unenforced kanban stages, inventory lost-update race, double-shipment race, missing tracking validation, and silent RX_TOKEN_SECRET misconfiguration.

**Architecture:** All race fixes use the same atomic-conditional-update pattern already proven in this codebase (`00032_inventory_atomic.sql`, `startRedemption`'s `.eq('status','available')` claim): a single conditional `UPDATE ... RETURNING` (or PostgREST `.update().eq(<precondition>).select()`) is the real guard; read-then-check remains only as a fast-path courtesy. The stranded-order fix reorders `reviewRx` so `orders.rx_status` only flips to `approved` after `generateWorkOrder` succeeds, with a compensating review-row delete on failure so the item stays in the admin queue.

**Tech Stack:** Next.js 16 server actions, Supabase (Postgres RPC + PostgREST), Vitest (mock-based unit tests per existing conventions in `tests/features/`).

## Global Constraints

- Work on branch `fix/backoffice-hardening` off `main`.
- TDD per task: write failing test → run → implement → run → commit.
- Run `npm run lint` before every commit. Commit messages use HEREDOC.
- Never weaken any existing compliance gate (Rx image, release, QC, destination). All changes ADD guards.
- New RPCs must `revoke execute ... from public; grant execute ... to service_role;` (pattern from `00032_inventory_atomic.sql:83-86`).
- Vitest mock conventions: mock `@/lib/supabase/admin` `createAdminClient` with a `mockFrom` table switch; mock `@/lib/auth/middleware` (see `tests/features/admin/review-rx.test.ts:1-16`).
- Migration file: next number is `00044` (last is `00043_guest_customer_dedupe.sql`).

---

### Task 1: reviewRx — never strand an approved order (Critical #1)

**Files:**
- Modify: `src/features/admin/rx-queue/actions/review-rx.ts:48-171`
- Test: `tests/features/admin/review-rx.test.ts` (extend)

**Interfaces:**
- Consumes: `generateWorkOrder(rxFileId): Promise<GenerateWorkOrderResult>` (unchanged).
- Produces: `reviewRx` now returns `{ success: false, error: 'Approval not applied: <reason>' }` when work-order generation fails, and the Rx stays in the review queue (its `rx_reviews` row is deleted). `orders.rx_status` is only set to `'approved'` after generation succeeds.

- [ ] **Step 1: Write the failing tests** — append to `tests/features/admin/review-rx.test.ts`:

```ts
  it('does NOT mark the order approved when work order generation fails, and removes the review so the Rx stays in the queue', async () => {
    generateWorkOrderMock.mockResolvedValueOnce({ success: false, error: 'Rx dispensing is restricted to US/CA in phase 1' });

    const reviewInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'review-9' }, error: null })),
      })),
    }));
    const reviewDelete = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    const rxFileSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'rx-9', order_id: 'order-9' }, error: null })),
      })),
    }));
    const orderUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: rxFileSelect };
      if (table === 'rx_reviews') return { insert: reviewInsert, delete: reviewDelete };
      if (table === 'audit_log') return { insert: auditInsert };
      if (table === 'orders') return { update: orderUpdate };
      return {};
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');
    const result = await reviewRx({ rxFileId: 'rx-9', decision: 'approved', decisionReason: 'clean_approved', notes: null });

    expect(result.success).toBe(false);
    expect(result.error).toContain('US/CA');
    // The order must NOT be flipped to approved — that's the strand.
    expect(orderUpdate).not.toHaveBeenCalled();
    // The review row is removed so the Rx reappears in the queue.
    expect(reviewDelete).toHaveBeenCalledTimes(1);
  });

  it('marks the order approved only after work order generation succeeds', async () => {
    const callOrder: string[] = [];
    generateWorkOrderMock.mockImplementationOnce(async () => {
      callOrder.push('generate');
      return { success: true, workOrderId: 'wo-1', workOrderNumber: 'WO-202607-001' };
    });
    const reviewInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'review-10' }, error: null })),
      })),
    }));
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    const rxFileSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'rx-10', order_id: 'order-10' }, error: null })),
      })),
    }));
    const orderUpdate = vi.fn(() => {
      callOrder.push('status-update');
      return { eq: vi.fn(() => Promise.resolve({ error: null })) };
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'rx_files') return { select: rxFileSelect };
      if (table === 'rx_reviews') return { insert: reviewInsert };
      if (table === 'audit_log') return { insert: auditInsert };
      if (table === 'orders') return {
        update: orderUpdate,
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { customer_email: 'a@x.com', shopify_order_number: 'GV-10' }, error: null }) }) }),
      };
      return {};
    });

    const { reviewRx } = await import('@/features/admin/rx-queue/actions/review-rx');
    const result = await reviewRx({ rxFileId: 'rx-10', decision: 'approved', decisionReason: 'clean_approved', notes: null });

    expect(result.success).toBe(true);
    expect(callOrder).toEqual(['generate', 'status-update']);
  });
```

Note: `sendOrderEmailOnce` is imported by review-rx from `@/lib/email/transactional` — if the existing test file does not already mock it, add at the top: `vi.mock('@/lib/email/transactional', () => ({ sendOrderEmailOnce: vi.fn(() => Promise.resolve()) }));` and `vi.mock('@/lib/email/templates/rx-approved', () => ({ renderRxApproved: () => ({ subject: 's', html: 'h', text: 't' }) }));` (check first — it may already be mocked since the current success test passes).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/features/admin/review-rx.test.ts`
Expected: the two new tests FAIL (first: `orderUpdate` WAS called / result.success true; second: callOrder is `['status-update', 'generate']`). Existing tests still pass.

- [ ] **Step 3: Implement** — in `review-rx.ts`, capture the review id and restructure lines 48-171. Replace the review insert with:

```ts
  const { data: review, error: reviewError } = await supabase
    .from('rx_reviews')
    .insert({
      rx_file_id: input.rxFileId,
      reviewer_user_id: reviewerUserId,
      decision: input.decision,
      decision_reason: input.decisionReason,
      notes: input.notes,
    })
    .select('id')
    .single();

  if (reviewError || !review) {
    return { success: false, error: 'Failed to save review' };
  }
```

Keep the `audit_log` `rx_review` insert as-is. Then replace everything from `const newStatus: RxStatus = ...` (line 82) through the end of the approved branch (line 168) with:

```ts
  if (input.decision !== 'approved') {
    const { error: updateError } = await supabase
      .from('orders')
      .update({ rx_status: 'rejected' satisfies RxStatus })
      .eq('id', rxFile.order_id);
    if (updateError) {
      console.error('[review-rx] orders.rx_status update failed', { orderId: rxFile.order_id, error: updateError });
      return { success: false, error: 'Review saved but order status update failed — please retry or contact support' };
    }

    // ... existing rejected block (soft-delete + rejection email) moves here unchanged ...

    return { success: true };
  }

  // Approved: generate the work order BEFORE flipping the order to approved.
  // If generation fails (non-dispensable destination, expired Rx, insert error),
  // an already-approved status would strand the order invisibly: the Rx leaves
  // the review queue (it filters on "no review row") and the customer page
  // renders a terminal "approved" state. So on failure we delete the review row
  // (the Rx reappears in the queue) and surface the error to the admin.
  const genResult = await generateWorkOrder(input.rxFileId);
  if (!genResult.success) {
    const { error: reviewDeleteError } = await supabase
      .from('rx_reviews')
      .delete()
      .eq('id', review.id);
    if (reviewDeleteError) {
      // Worst case: the review sticks and the Rx leaves the queue — but the
      // admin has seen this error, so it is no longer a silent strand.
      console.error('[review-rx] compensating review delete failed', { reviewId: review.id, error: reviewDeleteError });
    }
    const { error: failureAuditError } = await supabase.from('audit_log').insert({
      user_id: reviewerUserId,
      action: 'work_order_generation_failed',
      entity_type: 'rx_files',
      entity_id: input.rxFileId,
      after_data: { error: genResult.error } as unknown as Json,
    });
    if (failureAuditError) {
      console.error('[review-rx] failure-audit insert failed', failureAuditError);
    }
    return { success: false, error: `Approval not applied: ${genResult.error}` };
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ rx_status: 'approved' satisfies RxStatus })
    .eq('id', rxFile.order_id);
  if (updateError) {
    console.error('[review-rx] orders.rx_status update failed', { orderId: rxFile.order_id, error: updateError });
    return { success: false, error: 'Review saved but order status update failed — please retry or contact support' };
  }

  // ... existing approval-email try/catch moves here unchanged (the sendOrderEmailOnce block) ...

  return { success: true };
```

Delete the now-redundant old `if (input.decision === 'approved') { const genResult = ... }` block and the old `console.error('[review-rx] work order generation failed', ...)` line (superseded by the failure branch above).

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run tests/features/admin/review-rx.test.ts tests/features/admin/review-rx-email.test.ts`
Expected: PASS (all). If `review-rx-email.test.ts` asserts email-on-approval ordering, update its mocks the same way (generation success before status update).

- [ ] **Step 5: Commit**

```bash
npm run lint && git add src/features/admin/rx-queue/actions/review-rx.ts tests/features/admin/review-rx.test.ts && git commit -m "$(cat <<'EOF'
fix(admin): approve Rx only after work order generation succeeds

An approval whose work-order generation failed (non-dispensable
destination, expired Rx, insert error) used to flip rx_status to
approved anyway, stranding the order invisibly: gone from the review
queue, terminal "approved" on the customer page, no work order, no lab
job. Now generation runs first; on failure the review row is deleted so
the Rx stays in the queue and the admin sees the error.

Audit finding #1 (critical), 2026-07-28 back-office audit.
EOF
)"
```

---

### Task 2: reviewReturn — atomic claim prevents double refunds (High #2)

**Files:**
- Modify: `src/features/admin/returns/actions/review-return.ts:34-88`
- Test: `tests/features/admin/review-return.test.ts` (create)

**Interfaces:**
- Consumes: `createRefund(shopifyOrderId, amount, currency, note)` from `@/lib/commerce/shopify-admin` (unchanged).
- Produces: `reviewReturn` claims the row by atomically flipping `status` `'pending'` → `'in_progress'` (existing enum value, `00009_returns.sql:11`) before any refund; a lost claim returns `{ success: false, error: 'Return is not pending' }`; a Shopify refund failure rolls the claim back to `'pending'`.

- [ ] **Step 1: Write the failing test** — create `tests/features/admin/review-return.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'admin-1', email: 'a@x.com', role: 'founder', fullName: 'A' })),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

const createRefundMock = vi.fn(() => Promise.resolve({ refund: { id: 555 } }));
vi.mock('@/lib/commerce/shopify-admin', () => ({
  createRefund: (...a: unknown[]) => createRefundMock(...a),
}));

const RET_ROW = {
  id: 'ret-1', status: 'pending', order_id: 'order-1', line_item_id: 'li-1', preferred_resolution: 'refund',
  orders: { shopify_order_id: 9001, currency: 'USD', total: 200 },
  order_line_items: { line_total: 50 },
};

function makeReturnsTable(opts: { claimRows: Array<{ id: string }> }) {
  const claimSelect = vi.fn(() => Promise.resolve({ data: opts.claimRows, error: null }));
  const finalEq = vi.fn(() => Promise.resolve({ error: null }));
  // First update call = the claim (.eq('id').eq('status','pending').select());
  // later update calls = finalize / rollback (.eq('id') awaited directly).
  const update = vi.fn()
    .mockImplementationOnce(() => ({ eq: () => ({ eq: () => ({ select: claimSelect }) }) }))
    .mockImplementation(() => ({ eq: finalEq }));
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: RET_ROW, error: null })) })),
  }));
  return { table: { select, update }, update, finalEq };
}

describe('reviewReturn', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    createRefundMock.mockClear();
  });

  it('claims the return atomically, refunds once, and completes', async () => {
    const returns = makeReturnsTable({ claimRows: [{ id: 'ret-1' }] });
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'returns') return returns.table;
      if (table === 'audit_log') return { insert: auditInsert };
      return {};
    });

    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'ret-1', decision: 'approved_refund', adminNotes: null });

    expect(result.success).toBe(true);
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    expect(returns.update).toHaveBeenCalledTimes(2); // claim + finalize
  });

  it('does NOT refund when the claim is lost (concurrent double-submit)', async () => {
    const returns = makeReturnsTable({ claimRows: [] });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'returns') return returns.table;
      return {};
    });

    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'ret-1', decision: 'approved_refund', adminNotes: null });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Return is not pending');
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it('rolls the claim back to pending when the Shopify refund fails', async () => {
    createRefundMock.mockRejectedValueOnce(new Error('shopify 502'));
    const returns = makeReturnsTable({ claimRows: [{ id: 'ret-1' }] });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'returns') return returns.table;
      return {};
    });

    const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
    const result = await reviewReturn({ returnId: 'ret-1', decision: 'approved_refund', adminNotes: null });

    expect(result.success).toBe(false);
    // Second update call is the rollback; it must set status back to 'pending'.
    expect(returns.update).toHaveBeenCalledTimes(2);
    expect(returns.update.mock.calls[1][0]).toMatchObject({ status: 'pending' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/admin/review-return.test.ts`
Expected: FAIL — current code has one `update` call and refunds even without a claim.

- [ ] **Step 3: Implement** — in `review-return.ts`, insert between the `if (!orders)` guard (line 50) and the refund block (line 52):

```ts
  // Atomic claim: flip pending → in_progress in one conditional UPDATE so two
  // overlapping submissions (double-click, retry, second tab) cannot both pass
  // the pending check and each issue a real Shopify refund. The read above is a
  // courtesy fast-path; this is the guard.
  const { data: claimed, error: claimError } = await supabase
    .from('returns')
    .update({ status: 'in_progress' })
    .eq('id', input.returnId)
    .eq('status', 'pending')
    .select('id');
  if (claimError || !claimed || claimed.length === 0) {
    return { success: false, error: 'Return is not pending' };
  }
```

And in the refund `catch` (line 66-69), release the claim before returning:

```ts
    } catch (err) {
      // Release the claim so the admin can retry once Shopify recovers.
      await supabase.from('returns').update({ status: 'pending' }).eq('id', input.returnId);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: `Failed to create refund on Shopify: ${msg}` };
    }
```

The final `.update({...status: newStatus...})` stays as-is (it overwrites `in_progress` with the terminal status; a `decision === 'pending'` input restores `pending`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/features/admin/review-return.test.ts tests/features/admin/action-auth-guards.test.ts`
Expected: PASS. (`action-auth-guards` covers reviewReturn's Forbidden path — must still pass.)

- [ ] **Step 5: Commit**

```bash
npm run lint && git add src/features/admin/returns/actions/review-return.ts tests/features/admin/review-return.test.ts && git commit -m "$(cat <<'EOF'
fix(admin): atomic pending->in_progress claim prevents double refunds

reviewReturn's pending check was read-then-act: two overlapping
submissions could both pass it and each issue a Shopify refund. The
decision path now claims the row with a conditional UPDATE (status
pending -> in_progress) and only refunds after winning the claim; a
refund failure releases the claim for retry.

Audit finding #2 (high), 2026-07-28 back-office audit.
EOF
)"
```

---

### Task 3: Kanban stage enforcement (High #3)

**Files:**
- Modify: `src/features/lab/actions/move-job.ts:7-51`
- Modify: `src/features/lab/actions/add-qc-photo.ts:24-33`
- Modify: `src/features/lab/actions/create-shipment.ts:36-101` (job select + new column gate)
- Test: `tests/features/lab/kanban-transitions.test.ts` (create)
- Test: update fixtures in `tests/features/lab/shipment-compliance-gate.test.ts`, `tests/features/lab/shipment-fulfillment.test.ts`, `tests/features/lab/shipment-subscription-email.test.ts` (add `column: 'ship'` to mocked `lab_jobs` rows)

**Interfaces:**
- Produces: `moveJob` rejects forward moves of more than one stage (`'Jobs must advance one production stage at a time'`); backward moves stay allowed (rework). `addQcPhoto` rejects when `job.column !== 'qc'`. `createShipment` rejects when `job.column !== 'ship'` (`'Cannot ship: job is not in the ship column'`).

- [ ] **Step 1: Write the failing tests** — create `tests/features/lab/kanban-transitions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));
vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'lab-1', email: 'l@x.com', role: 'lab_operator', fullName: 'L' })),
  isLabRole: (role: string) => role === 'lab_operator' || role === 'lab_admin' || role === 'founder',
}));

function jobTable(job: Record<string, unknown>) {
  const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
  return {
    table: {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: job, error: null })) })) })),
      update,
    },
    update,
  };
}

const RELEASED_WO = { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { released_to_lab_at: '2026-07-01' }, error: null }) }) }) };

describe('kanban stage enforcement', () => {
  beforeEach(() => mockFrom.mockReset());

  it('rejects skipping forward more than one stage (inbox -> ship)', async () => {
    const jobs = jobTable({ id: 'j1', work_order_id: 'wo1', column: 'inbox', qc_photos: ['j1/a.jpg'], started_at: null });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : t === 'work_orders' ? RELEASED_WO : {}));

    const { moveJob } = await import('@/features/lab/actions/move-job');
    const result = await moveJob('j1', 'ship');

    expect(result.success).toBe(false);
    expect(result.error).toContain('one production stage');
    expect(jobs.update).not.toHaveBeenCalled();
  });

  it('allows advancing exactly one stage (on_edger -> on_bench)', async () => {
    const jobs = jobTable({ id: 'j2', work_order_id: 'wo1', column: 'on_edger', qc_photos: [], started_at: '2026-07-01' });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : {}));

    const { moveJob } = await import('@/features/lab/actions/move-job');
    const result = await moveJob('j2', 'on_bench');

    expect(result.success).toBe(true);
    expect(jobs.update).toHaveBeenCalledTimes(1);
  });

  it('allows moving backward for rework (qc -> on_bench) when QC photos exist', async () => {
    const jobs = jobTable({ id: 'j3', work_order_id: 'wo1', column: 'qc', qc_photos: ['j3/a.jpg'], started_at: '2026-07-01' });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : {}));

    const { moveJob } = await import('@/features/lab/actions/move-job');
    const result = await moveJob('j3', 'on_bench');

    expect(result.success).toBe(true);
  });

  it('rejects attaching a QC photo while the job is not in the QC stage', async () => {
    const jobs = jobTable({ id: 'j4', work_order_id: 'wo1', column: 'on_bench', qc_photos: [] });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : {}));

    const { addQcPhoto } = await import('@/features/lab/actions/add-qc-photo');
    const result = await addQcPhoto('j4', 'j4/photo.jpg');

    expect(result.success).toBe(false);
    expect(result.error).toContain('QC stage');
    expect(jobs.update).not.toHaveBeenCalled();
  });

  it('allows attaching a QC photo in the QC stage', async () => {
    const jobs = jobTable({ id: 'j5', work_order_id: 'wo1', column: 'qc', qc_photos: [] });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : {}));

    const { addQcPhoto } = await import('@/features/lab/actions/add-qc-photo');
    const result = await addQcPhoto('j5', 'j5/photo.jpg');

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run tests/features/lab/kanban-transitions.test.ts`
Expected: FAIL — `inbox -> ship` currently succeeds when released + photos exist; `addQcPhoto` ignores column.

- [ ] **Step 3: Implement `moveJob`** — in `move-job.ts`, add after the enum type alias (line 7):

```ts
const COLUMN_ORDER: KanbanColumn[] = ['inbox', 'ready_to_cut', 'on_edger', 'on_bench', 'qc', 'ship'];
```

and insert after the `if (!job)` guard (line 26):

```ts
  // Production stages are a physical pipeline: a frame cannot be shipped
  // without being cut, edged, benched, and QC'd. Forward moves advance exactly
  // one stage; backward moves (rework) are always allowed.
  const fromIdx = COLUMN_ORDER.indexOf(job.column);
  const toIdx = COLUMN_ORDER.indexOf(toColumn);
  if (toIdx === -1) return { success: false, error: 'Unknown column' };
  if (toIdx > fromIdx + 1) {
    return { success: false, error: 'Jobs must advance one production stage at a time' };
  }
```

Keep the existing QC-exit and ship-entry (release + photos) checks — the ship-entry check is now also reachable only from `qc`, which is the intended defense-in-depth.

- [ ] **Step 4: Implement `addQcPhoto`** — in `add-qc-photo.ts`, change the select (line 26) to `select('column, qc_photos')` and add after the `if (!job)` guard (line 30):

```ts
  // QC photos document the finished pair at inspection time. Attaching one
  // earlier would satisfy the QC shipment gate without the job ever reaching
  // QC, so bind the upload to the QC stage.
  if (job.column !== 'qc') {
    return { success: false, error: 'QC photos can only be added while the job is in the QC stage' };
  }
```

- [ ] **Step 5: Implement `createShipment` column gate** — in `create-shipment.ts`, change the job select (line 38) to `select('id, work_order_id, column, qc_photos, completed_at, shipment_id')` and add after the QC-photos gate (line 101):

```ts
  // Defense in depth: createShipment is an independently invokable server
  // action, so re-assert the kanban precondition moveJob enforces — the job
  // must actually be in the ship column.
  if (job.column !== 'ship') {
    return { success: false, error: 'Cannot ship: job is not in the ship column' };
  }
```

- [ ] **Step 6: Fix existing shipment-test fixtures** — in `tests/features/lab/shipment-compliance-gate.test.ts`, `shipment-fulfillment.test.ts`, `shipment-subscription-email.test.ts`, add `column: 'ship'` to every mocked `lab_jobs` row that is expected to ship successfully (leave failure-case rows alone unless they now fail for the wrong reason — each failure assertion must still match its expected error string).

- [ ] **Step 7: Run the full lab suite**

Run: `npx vitest run tests/features/lab/`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
npm run lint && git add src/features/lab/actions/move-job.ts src/features/lab/actions/add-qc-photo.ts src/features/lab/actions/create-shipment.ts tests/features/lab/ && git commit -m "$(cat <<'EOF'
fix(lab): enforce kanban stage order end to end

moveJob now advances at most one stage per move (backward rework moves
stay allowed), addQcPhoto only accepts photos while the job is in QC,
and createShipment re-asserts the job is in the ship column. Previously
a released job could jump inbox -> ship with one early QC photo and be
fulfilled without ever passing edging or bench assembly.

Audit finding #3 (high), 2026-07-28 back-office audit.
EOF
)"
```

---

### Task 4: Atomic inventory adjustment RPC (Medium #4)

**Files:**
- Create: `supabase/migrations/00044_adjust_inventory_atomic.sql`
- Modify: `src/features/admin/inventory/actions/adjust-inventory.ts:24-54`
- Modify: `src/lib/supabase/types.ts` (add the RPC to the `Functions` section, following the existing `reserve_inventory_unit` entry's shape)
- Test: `tests/features/admin/adjust-inventory.test.ts` (create)

**Interfaces:**
- Produces: SQL function `adjust_inventory_pool(p_pool_id uuid, p_delta int, p_reason adjustment_reason, p_user_id uuid, p_notes text default null) returns int` — new quantity, or NULL when the pool is missing or the delta would go negative. `adjustInventory` keeps its exact signature and error strings (`'Pool not found'`, `'Quantity would go negative'`, `'Failed to update pool'`).

- [ ] **Step 1: Write the migration** — `supabase/migrations/00044_adjust_inventory_atomic.sql`:

```sql
-- Atomic manual inventory adjustment (2026-07-28 back-office audit, finding #4).
--
-- adjustInventory previously did SELECT pool_quantity → check → UPDATE in JS —
-- the exact lost-update race 00032 fixed for the reserve/release path. Two
-- concurrent adjustments both read the same starting value and the second
-- write silently clobbered the first, desyncing the pool from its own
-- adjustments ledger. Same cure: one conditional UPDATE ... RETURNING, with
-- the ledger row written in the same function so pool and ledger never drift.

create or replace function adjust_inventory_pool(
  p_pool_id uuid,
  p_delta int,
  p_reason adjustment_reason,
  p_user_id uuid,
  p_notes text default null
) returns int
language plpgsql
as $$
declare
  v_new_qty int;
begin
  update inventory_pool
     set pool_quantity = pool_quantity + p_delta,
         last_updated_by = p_user_id,
         last_updated_at = now()
   where id = p_pool_id
     and pool_quantity + p_delta >= 0
  returning pool_quantity into v_new_qty;

  if v_new_qty is null then
    return null;
  end if;

  insert into inventory_adjustments (inventory_pool_id, delta, reason, user_id, notes)
  values (p_pool_id, p_delta, p_reason, p_user_id, p_notes);

  return v_new_qty;
end;
$$;

-- Service-role only, same rationale as 00032: PUBLIC EXECUTE + PostgREST would
-- let any anon/authenticated key holder mutate stock directly.
revoke execute on function adjust_inventory_pool(uuid, int, adjustment_reason, uuid, text) from public;
grant execute on function adjust_inventory_pool(uuid, int, adjustment_reason, uuid, text) to service_role;
```

- [ ] **Step 2: Write the failing test** — create `tests/features/admin/adjust-inventory.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));
vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'admin-1', email: 'a@x.com', role: 'founder', fullName: 'A' })),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));
vi.mock('@/lib/commerce/shopify-admin', () => ({
  adminFetch: vi.fn(),
  updateInventoryLevel: vi.fn(),
}));

describe('adjustInventory', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it('adjusts via the atomic RPC (no read-modify-write)', async () => {
    mockRpc.mockResolvedValueOnce({ data: 7, error: null });

    const { adjustInventory } = await import('@/features/admin/inventory/actions/adjust-inventory');
    const result = await adjustInventory('pool-1', 3, 'restock', 'weekly restock');

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('adjust_inventory_pool', {
      p_pool_id: 'pool-1', p_delta: 3, p_reason: 'restock', p_user_id: 'admin-1', p_notes: 'weekly restock',
    });
    // The action must not SELECT + UPDATE the pool row itself anymore.
    expect(mockFrom).not.toHaveBeenCalledWith('inventory_adjustments');
  });

  it('reports would-go-negative when the RPC returns null for an existing pool', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    mockFrom.mockImplementation((table: string) =>
      table === 'inventory_pool'
        ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'pool-1' }, error: null }) }) }) }
        : {},
    );

    const { adjustInventory } = await import('@/features/admin/inventory/actions/adjust-inventory');
    const result = await adjustInventory('pool-1', -99, 'damaged', null);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Quantity would go negative');
  });

  it('reports pool-not-found when the RPC returns null and no pool row exists', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    mockFrom.mockImplementation((table: string) =>
      table === 'inventory_pool'
        ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }
        : {},
    );

    const { adjustInventory } = await import('@/features/admin/inventory/actions/adjust-inventory');
    const result = await adjustInventory('pool-x', 1, 'restock', null);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Pool not found');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/features/admin/adjust-inventory.test.ts`
Expected: FAIL — current implementation never calls `rpc`.

- [ ] **Step 4: Implement** — replace the body of `adjustInventory` (lines 22-54) with:

```ts
  const supabase = createAdminClient();

  // Atomic: the RPC does the guard, the pool mutation, and the ledger insert in
  // one statement, eliminating the read-modify-write race where two concurrent
  // adjustments clobbered each other (same fix as 00032's reserve/release).
  const { data: newQty, error: rpcError } = await supabase.rpc('adjust_inventory_pool', {
    p_pool_id: poolId,
    p_delta: delta,
    p_reason: reason,
    p_user_id: userId,
    p_notes: notes ?? undefined,
  });
  if (rpcError) return { success: false, error: 'Failed to update pool' };

  if (newQty === null) {
    // NULL means the conditional UPDATE matched no row: pool missing, or the
    // delta would take the quantity negative. Distinguish for a useful message.
    const { data: pool } = await supabase
      .from('inventory_pool')
      .select('id')
      .eq('id', poolId)
      .maybeSingle();
    return { success: false, error: pool ? 'Quantity would go negative' : 'Pool not found' };
  }

  return { success: true };
```

In `src/lib/supabase/types.ts`, add to the `Functions` section (match the surrounding generated style exactly):

```ts
      adjust_inventory_pool: {
        Args: {
          p_pool_id: string
          p_delta: number
          p_reason: Database["public"]["Enums"]["adjustment_reason"]
          p_user_id: string
          p_notes?: string
        }
        Returns: number
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/features/admin/adjust-inventory.test.ts tests/features/admin/action-auth-guards.test.ts`
Expected: PASS.

- [ ] **Step 6: Apply the migration locally and smoke-check**

Run: `supabase db reset` (local only — this is the project's demo reset; skip if local Supabase isn't running and note it in the commit)
Expected: migrations 00001–00044 apply cleanly.

- [ ] **Step 7: Commit**

```bash
npm run lint && git add supabase/migrations/00044_adjust_inventory_atomic.sql src/features/admin/inventory/actions/adjust-inventory.ts src/lib/supabase/types.ts tests/features/admin/adjust-inventory.test.ts && git commit -m "$(cat <<'EOF'
fix(admin): atomic RPC for manual inventory adjustments

adjustInventory reintroduced the SELECT->check->UPDATE lost-update race
that 00032 fixed for reserve/release: concurrent adjustments clobbered
each other while both ledger rows landed, desyncing pool_quantity from
its own audit trail. adjust_inventory_pool() now does the guard, the
mutation, and the ledger insert in one conditional UPDATE ... RETURNING.

Audit finding #4 (medium), 2026-07-28 back-office audit.
EOF
)"
```

---

### Task 5: createShipment — atomic claim prevents double shipment (Medium #5)

**Files:**
- Modify: `src/features/lab/actions/create-shipment.ts:115-135`
- Test: `tests/features/lab/shipment-claim.test.ts` (create); update `lab_jobs` update-mocks in the three existing shipment test files to support the chained `.update().eq().is().select()` claim call.

**Interfaces:**
- Produces: after all compliance gates pass, `createShipment` claims the job via `.update({ completed_at }).eq('id', jobId).is('completed_at', null).select('id')`; zero rows → `'This job has already been shipped'`. A failed shipment insert releases the claim (`completed_at: null`). The follow-up `lab_jobs` update sets only `shipment_id`.

- [ ] **Step 1: Write the failing test** — create `tests/features/lab/shipment-claim.test.ts`. Mock setup mirrors the existing `shipment-compliance-gate.test.ts` (copy its mock preamble for `createAdminClient`, auth middleware, shopify-admin, email, advance-redemption). Core cases:

```ts
  it('returns already-shipped when the atomic claim matches no row (concurrent call won)', async () => {
    // job row passes all gates (column ship, photos, no completed_at) but the
    // claim update resolves { data: [], error: null } — the concurrent call won.
    // Assert: result.error === 'This job has already been shipped' and the
    // shipments insert was NOT called.
  });

  it('releases the claim when the shipments insert fails', async () => {
    // claim resolves { data: [{ id: 'job-1' }] }, shipments insert resolves
    // { data: null, error: { message: 'boom' } }.
    // Assert: a follow-up lab_jobs update was called with { completed_at: null }
    // and result.success === false.
  });
```

Write these as real tests (full mock wiring copied from `shipment-compliance-gate.test.ts`, with the `lab_jobs` table mock exposing `update` as a `vi.fn()` whose first invocation returns `{ eq: () => ({ is: () => ({ select: () => Promise.resolve(<claim result>) }) }) }` and later invocations return `{ eq: () => Promise.resolve({ error: null }) }`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/features/lab/shipment-claim.test.ts`
Expected: FAIL — current code has no `.is('completed_at', null)` claim.

- [ ] **Step 3: Implement** — in `create-shipment.ts`, insert immediately before the shipments insert (line 115):

```ts
  // Atomic claim: the completed_at/shipment_id read above is a fast-path
  // courtesy check only — two concurrent calls can both pass it. This
  // conditional update is the real guard: exactly one caller flips
  // completed_at from NULL and proceeds to create the shipment.
  const shippedAt = new Date().toISOString();
  const { data: claimedRows, error: claimError } = await supabase
    .from('lab_jobs')
    .update({ completed_at: shippedAt })
    .eq('id', input.jobId)
    .is('completed_at', null)
    .select('id');
  if (claimError || !claimedRows || claimedRows.length === 0) {
    return { success: false, error: 'This job has already been shipped' };
  }
```

Change the shipments insert to use `shipped_at: shippedAt`, and its failure branch to release the claim:

```ts
  if (shipErr || !shipment) {
    await supabase.from('lab_jobs').update({ completed_at: null }).eq('id', input.jobId);
    return { success: false, error: 'Failed to create shipment' };
  }
```

Change the follow-up job update (lines 132-135) to set only the shipment id:

```ts
  await supabase
    .from('lab_jobs')
    .update({ shipment_id: shipment.id })
    .eq('id', input.jobId);
```

- [ ] **Step 4: Update existing shipment test fixtures** — the three existing shipment test files mock `lab_jobs.update` as a single-shape chain; make their `update` mock handle both the claim chain (`.eq().is().select()` → `Promise.resolve({ data: [{ id: <jobId> }], error: null })`) and the plain `.eq()` follow-up. A reusable local helper in each file is fine (do not over-abstract across files).

- [ ] **Step 5: Run the full lab suite**

Run: `npx vitest run tests/features/lab/`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
npm run lint && git add src/features/lab/actions/create-shipment.ts tests/features/lab/ && git commit -m "$(cat <<'EOF'
fix(lab): atomic completed_at claim prevents double shipment

The already-shipped guard was a plain read: two concurrent
createShipment calls could both pass it and each insert a shipments row
and push a Shopify fulfillment. The job is now claimed with a
conditional UPDATE (completed_at IS NULL) after the compliance gates; a
failed shipment insert releases the claim.

Audit finding #5 (medium), 2026-07-28 back-office audit.
EOF
)"
```

---

### Task 6: Server-side tracking-number + carrier validation (Low #6)

**Files:**
- Create: `src/features/lab/carriers.ts`
- Modify: `src/features/lab/components/ShippingQueue.tsx:16` (import instead of local const)
- Modify: `src/features/lab/actions/create-shipment.ts:28-33` (validate input)
- Test: extend `tests/features/lab/shipment-claim.test.ts` (or a small dedicated describe block in it)

**Interfaces:**
- Produces: `export const CARRIERS = ['DHL', 'FedEx', 'Shiprocket', 'India Post', 'Aramex'] as const;` in `src/features/lab/carriers.ts`. `createShipment` rejects blank/whitespace tracking numbers (`'Tracking number is required'`) and unknown carriers (`'Unknown carrier'`), and uses the trimmed tracking number everywhere downstream.

- [ ] **Step 1: Write the failing tests** — add to the shipment claim test file:

```ts
  it('rejects a whitespace-only tracking number server-side', async () => {
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'DHL', trackingNumber: '   ' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Tracking number is required');
  });

  it('rejects an unknown carrier server-side', async () => {
    const { createShipment } = await import('@/features/lab/actions/create-shipment');
    const result = await createShipment({ jobId: 'job-1', carrier: 'PigeonPost', trackingNumber: 'TRK123' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown carrier');
  });
```

(These run before any DB mock matters — validation must precede the job fetch, so no extra mock wiring is needed beyond the auth mock.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/features/lab/shipment-claim.test.ts`
Expected: the two new tests FAIL (current code accepts both).

- [ ] **Step 3: Implement** — create `src/features/lab/carriers.ts`:

```ts
// Shared between the ShippingQueue UI and the createShipment server action so
// the server validates against the same list the form offers.
export const CARRIERS = ['DHL', 'FedEx', 'Shiprocket', 'India Post', 'Aramex'] as const;
```

In `ShippingQueue.tsx`, delete the local `const CARRIERS = [...]` (line 16) and add `import { CARRIERS } from '../carriers';`.

In `create-shipment.ts`, add `import { CARRIERS } from '../carriers';` and insert after the auth guard (line 32):

```ts
  // The client form validates these too, but server actions are directly
  // invokable HTTP endpoints — a blank tracking number would otherwise pass
  // every compliance gate and reach Shopify's fulfillment API.
  const trackingNumber = input.trackingNumber?.trim() ?? '';
  if (!trackingNumber) return { success: false, error: 'Tracking number is required' };
  if (!(CARRIERS as readonly string[]).includes(input.carrier)) {
    return { success: false, error: 'Unknown carrier' };
  }
```

Replace every later use of `input.trackingNumber` in the action (shipments insert, `sendPairShippedEmail` call, `createFulfillment` call, failure-audit `after_data`) with the trimmed `trackingNumber`.

- [ ] **Step 4: Run lab suite**

Run: `npx vitest run tests/features/lab/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && git add src/features/lab/carriers.ts src/features/lab/components/ShippingQueue.tsx src/features/lab/actions/create-shipment.ts tests/features/lab/ && git commit -m "$(cat <<'EOF'
fix(lab): validate tracking number and carrier server-side

createShipment trusted the client form: a scripted call with a blank
tracking number or unknown carrier passed every gate and reached
Shopify fulfillment. The action now trims and requires the tracking
number and validates the carrier against the shared CARRIERS list.

Audit finding #6 (low), 2026-07-28 back-office audit.
EOF
)"
```

---

### Task 7: verifyRxToken — surface secret misconfiguration (Minor)

**Files:**
- Modify: `src/features/rx-intake/lib/rx-token.ts:23-44`
- Test: `tests/features/rx-intake/rx-token.test.ts` (extend if it exists — check with `ls tests/features/rx-intake/`; create otherwise)

**Interfaces:**
- Produces: `verifyRxToken` throws when `RX_TOKEN_SECRET` is unset (so misconfiguration surfaces as a 500/Sentry event instead of silently rejecting every customer link) and cleanly returns `false` on wrong-length tokens. Mirrors `verifyClaimToken` (`src/lib/auth/claim-token.ts:23-40`).

- [ ] **Step 1: Write the failing test:**

```ts
  it('throws (not false) when RX_TOKEN_SECRET is missing — misconfiguration must surface', async () => {
    vi.stubEnv('RX_TOKEN_SECRET', '');
    const { verifyRxToken } = await import('@/features/rx-intake/lib/rx-token');
    expect(() => verifyRxToken('order-1', 'deadbeef', Date.now() + 60_000)).toThrow('RX_TOKEN_SECRET');
    vi.unstubAllEnvs();
  });

  it('returns false for a wrong-length token', async () => {
    vi.stubEnv('RX_TOKEN_SECRET', 'test-secret');
    const { verifyRxToken } = await import('@/features/rx-intake/lib/rx-token');
    expect(verifyRxToken('order-1', 'short', Date.now() + 60_000)).toBe(false);
    vi.unstubAllEnvs();
  });
```

(If the module caches env at import time in the existing test setup, use `vi.resetModules()` before each `import`.)

- [ ] **Step 2: Run to verify the throw-test fails** (currently the catch swallows it and returns `false`).

- [ ] **Step 3: Implement** — replace `verifyRxToken`'s body (lines 31-43) with:

```ts
  try {
    const payload = `${orderId}:${exp}`;
    const expected = createHmac('sha256', getSecret())
      .update(payload, 'utf-8')
      .digest('hex');

    // timingSafeEqual throws on length mismatch — guard so a wrong-length token
    // is a clean rejection, not a thrown-then-swallowed false.
    if (token.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch (e) {
    // A misconfigured secret must surface (Sentry/500), not silently reject
    // every token as if it were invalid.
    if (e instanceof Error && e.message.includes('RX_TOKEN_SECRET')) throw e;
    return false;
  }
```

- [ ] **Step 4: Run the rx-intake tests + full suite spot**

Run: `npx vitest run tests/features/rx-intake/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && git add src/features/rx-intake/lib/rx-token.ts tests/features/rx-intake/ && git commit -m "$(cat <<'EOF'
fix(rx): surface missing RX_TOKEN_SECRET instead of silent rejection

verifyRxToken's catch swallowed every exception, so an unset secret
rejected all customer Rx links as "invalid" with no error anywhere.
Now mirrors verifyClaimToken: missing-secret re-throws (500/Sentry),
wrong-length tokens still return false cleanly.

Minor finding, 2026-07-28 back-office audit.
EOF
)"
```

---

### Task 8: Full verification + external review

- [ ] **Step 1:** Run: `npm run test` — Expected: all tests pass (489 pre-existing + new ones).
- [ ] **Step 2:** Run: `npm run lint` — Expected: clean.
- [ ] **Step 3:** Run: `npm run build` — Expected: success.
- [ ] **Step 4:** Dispatch an external `code-review` subagent over `git diff main...fix/backoffice-hardening` (per CLAUDE.md: the generator never grades its own work). Address any confirmed findings.
- [ ] **Step 5:** Present the branch for merge via superpowers:finishing-a-development-branch.

## Deliberately out of scope (YAGNI)

- **`needs_info` review decision**: unreachable dead enum value; wiring it up is a new feature, not a fix.
- **Admin dashboard stat for approved-orders-without-work-orders**: Task 1 removes the only path that produced them, and there is no production data containing stranded rows. Revisit only if evidence appears.
- **Early destination gate at Rx intake/webhook sync**: with Task 1, a non-dispensable destination now surfaces to the admin at review time with a clear error instead of stranding — sufficient for phase 1 volumes.
