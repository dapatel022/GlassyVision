import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: () => getCurrentUser(),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

import { savePlan, type SavePlanInput } from '@/features/admin/plans/actions/save-plan';

interface InstallOpts {
  /** existing plan row returned by the id lookup (edit path) */
  existing?: Record<string, unknown> | null;
  /** count of live memberships referencing the plan */
  liveMembershipCount?: number;
  /** id returned by an insert */
  insertedId?: string;
}

function install(o: InstallOpts = {}) {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

  mockFrom.mockImplementation((table: string) => {
    if (table === 'subscription_plans') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: o.existing ?? null, error: null }),
          }),
        }),
        insert: (values: Record<string, unknown>) => {
          inserts.push({ table, values });
          return {
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: o.insertedId ?? 'plan-new' }, error: null }),
            }),
          };
        },
        update: (values: Record<string, unknown>) => {
          updates.push({ table, values });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    }
    if (table === 'subscription_memberships') {
      return {
        select: () => ({
          eq: () => ({
            in: () =>
              Promise.resolve({ count: o.liveMembershipCount ?? 0, error: null }),
          }),
        }),
      };
    }
    if (table === 'audit_log') {
      return {
        insert: (values: Record<string, unknown>) => {
          inserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
      };
    }
    return {};
  });

  return { inserts, updates };
}

const validInput: SavePlanInput = {
  name: 'GlassyVision Annual — 3 Pairs',
  pairsCount: 3,
  termMonths: 12,
  redemptionMode: 'all_immediate',
  endOfTermMode: 'refund',
  reminderDays: [60, 30, 7],
  graceDays: 14,
  status: 'active',
  shopifyProductId: 111,
  shopifyVariantId: 222,
};

beforeEach(() => {
  mockFrom.mockReset();
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ id: 'f-1', email: 'f@x.com', role: 'founder', fullName: 'F' });
});

describe('savePlan', () => {
  it('rejects a non-admin caller', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u', email: 'u@x.com', role: 'pending', fullName: null });
    install();
    const res = await savePlan(validInput);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/forbidden/i);
  });

  it('rejects an unauthenticated caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    install();
    const res = await savePlan(validInput);
    expect(res.success).toBe(false);
  });

  it('validates pairs_count > 0', async () => {
    install();
    const res = await savePlan({ ...validInput, pairsCount: 0 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/pairs/i);
  });

  it('validates term_months > 0', async () => {
    install();
    const res = await savePlan({ ...validInput, termMonths: 0 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/term/i);
  });

  it('validates end_of_term mode is one of expire/refund/rollover', async () => {
    install();
    const res = await savePlan({
      ...validInput,
      endOfTermMode: 'bogus' as unknown as SavePlanInput['endOfTermMode'],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/end.of.term|mode/i);
  });

  it('inserts a new plan and writes audit_log when no id is supplied', async () => {
    const { inserts } = install({ insertedId: 'plan-xyz' });
    const res = await savePlan(validInput);
    expect(res.success).toBe(true);
    expect(res.id).toBe('plan-xyz');

    const planInsert = inserts.find((i) => i.table === 'subscription_plans');
    expect(planInsert).toBeDefined();
    expect(planInsert!.values.pairs_count).toBe(3);
    expect(planInsert!.values.term_months).toBe(12);
    expect(planInsert!.values.end_of_term_policy).toMatchObject({
      mode: 'refund',
      reminder_days: [60, 30, 7],
      grace_days: 14,
    });
    expect(planInsert!.values.redemption_policy).toMatchObject({ mode: 'all_immediate' });

    const audit = inserts.find((i) => i.table === 'audit_log');
    expect(audit).toBeDefined();
    expect(audit!.values.action).toBe('plan_saved');
  });

  it('updates an existing plan when an id is supplied and no live memberships exist', async () => {
    const { updates } = install({
      existing: { id: 'plan-1', pairs_count: 3, term_months: 12 },
      liveMembershipCount: 0,
    });
    const res = await savePlan({ ...validInput, id: 'plan-1', name: 'Renamed' });
    expect(res.success).toBe(true);
    const planUpdate = updates.find((u) => u.table === 'subscription_plans');
    expect(planUpdate).toBeDefined();
    expect(planUpdate!.values.name).toBe('Renamed');
  });

  it('blocks editing pairs_count when the plan has live memberships', async () => {
    install({
      existing: { id: 'plan-1', pairs_count: 3, term_months: 12 },
      liveMembershipCount: 5,
    });
    const res = await savePlan({ ...validInput, id: 'plan-1', pairsCount: 4 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/live membership/i);
  });

  it('blocks editing term_months when the plan has live memberships', async () => {
    install({
      existing: { id: 'plan-1', pairs_count: 3, term_months: 12 },
      liveMembershipCount: 5,
    });
    const res = await savePlan({ ...validInput, id: 'plan-1', termMonths: 24 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/live membership/i);
  });

  it('allows status/markets/shopify edits on a plan with live memberships (terms unchanged)', async () => {
    const { updates } = install({
      existing: { id: 'plan-1', pairs_count: 3, term_months: 12 },
      liveMembershipCount: 5,
    });
    const res = await savePlan({
      ...validInput,
      id: 'plan-1',
      status: 'archived',
      shopifyProductId: 999,
    });
    expect(res.success).toBe(true);
    const planUpdate = updates.find((u) => u.table === 'subscription_plans');
    expect(planUpdate!.values.status).toBe('archived');
    expect(planUpdate!.values.shopify_product_id).toBe(999);
  });
});
