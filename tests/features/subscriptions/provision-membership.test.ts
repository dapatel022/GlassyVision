import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const supabase = { from };
function table(impl: Record<string, unknown>) { return impl; }

beforeEach(() => { from.mockReset(); });

const activePlan = {
  id: 'plan-1', shopify_product_id: 111, shopify_variant_id: 222,
  pairs_count: 3, term_months: 12,
  redemption_policy: { mode: 'all_immediate' }, end_of_term_policy: {},
};

describe('provisionMembershipFromOrder', () => {
  it('does nothing when no line item matches an active plan product', async () => {
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 999, product_id: 999 }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(false);
  });

  it('provisions a membership + N slots when paid and product matches', async () => {
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'mem-1' }, error: null }) }) }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 222, product_id: 111 }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(true);
    expect(res.membershipId).toBe('mem-1');
    expect(slotInsert).toHaveBeenCalledTimes(1); // bulk insert of 3 rows
    const slotCalls = slotInsert.mock.calls as unknown as unknown[][];
    expect(slotCalls[0][0]).toHaveLength(3);
  });

  it('does NOT provision when not paid', async () => {
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', financial_status: 'pending' } as never, supabase as never);
    expect(res.provisioned).toBe(false);
  });

  it('is idempotent when the insert returns a null row (ON CONFLICT no-op)', async () => {
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 222, product_id: 111 }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(false);
    expect(slotInsert).not.toHaveBeenCalled(); // no second set of slots
  });

  it('is idempotent when the insert surfaces a unique violation (error code 23505)', async () => {
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }) }) }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 222, product_id: 111 }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(false);
    expect(slotInsert).not.toHaveBeenCalled();
  });
});
