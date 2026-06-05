import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmail = vi.fn(async (_input: { subject: string }) => ({ success: true, providerMessageId: 'msg-1' }));
vi.mock('@/lib/email/resend', () => ({ sendEmail: (input: { subject: string }) => sendEmail(input) }));

const from = vi.fn();
const supabase = { from };
function table(impl: Record<string, unknown>) { return impl; }

beforeEach(() => { from.mockReset(); sendEmail.mockClear(); });

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
    // the order's settlement currency is persisted onto the membership
    expect(membershipInsert).toHaveBeenCalledWith(expect.objectContaining({ currency: 'usd' }));
  });

  it('persists CAD currency from a Canadian membership purchase', async () => {
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'mem-2' }, error: null }) }) }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 222, product_id: 111 }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o2', shopify_order_id: 556, customer_id: 'c2', customer_email: 'c@d.com', currency: 'CAD', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(true);
    expect(membershipInsert).toHaveBeenCalledWith(expect.objectContaining({ currency: 'cad' }));
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

  // ---- Task 5.2: lifecycle email sends on provisioning ----

  // Build a full happy-path mock where prior comms are absent (nothing sent yet),
  // a customer name resolves, and comms claim inserts succeed.
  function happyMocks(priorComms: Array<{ metadata: unknown; status: string }> = []) {
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'mem-1' }, error: null }) }) }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    const commsInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'comm-1' }, error: null }) }) }));
    const commsUpdate = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 222, product_id: 111 }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      if (t === 'customers') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { first_name: 'Dev', email: 'a@b.com' }, error: null }) }) }) };
      if (t === 'communications') return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: priorComms, error: null }) }) }), insert: commsInsert, update: commsUpdate };
      return table({});
    });
    return { membershipInsert, slotInsert, commsInsert, commsUpdate };
  }

  it('sends a membership_welcome and a slot_unlocked email on first provisioning', async () => {
    happyMocks();
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(true);
    const subjects = sendEmail.mock.calls.map((c) => c[0].subject.toLowerCase());
    expect(subjects.some((s) => s.includes('welcome'))).toBe(true);
    expect(subjects.some((s) => s.includes('ready') || s.includes('redeem'))).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('does not re-send when a welcome+slot comm already exists (idempotent re-delivery)', async () => {
    happyMocks([
      { status: 'sent', metadata: { membership_id: 'mem-1', comm: 'membership_welcome' } },
      { status: 'sent', metadata: { membership_id: 'mem-1', comm: 'slot_unlocked' } },
    ]);
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('still provisions when the email send path throws (best-effort, non-gating)', async () => {
    happyMocks();
    sendEmail.mockRejectedValueOnce(new Error('resend down'));
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o1', shopify_order_id: 555, customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(true);
  });
});
