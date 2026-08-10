import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmail = vi.fn(async (_input: { subject: string }) => ({ success: true, providerMessageId: 'msg-1' }));
vi.mock('@/lib/email/resend', () => ({ sendEmail: (input: { subject: string }) => sendEmail(input) }));

const autoRedeemConfiguredPairs = vi.fn(async () => ({ redeemed: 0, fallbacks: 0 }));
vi.mock('@/features/subscriptions/auto-redeem-pairs', () => ({
  autoRedeemConfiguredPairs: (...args: unknown[]) =>
    (autoRedeemConfiguredPairs as unknown as (...a: unknown[]) => Promise<{ redeemed: number; fallbacks: number }>)(...args),
}));

const from = vi.fn();
const supabase = { from };
function table(impl: Record<string, unknown>) { return impl; }

beforeEach(() => { from.mockReset(); sendEmail.mockClear(); autoRedeemConfiguredPairs.mockClear(); });

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

  it('flags a SECOND membership purchase by an active member instead of swallowing it', async () => {
    // 23505 from the one-active-membership partial unique index is NOT idempotency:
    // the customer paid for a distinct order and would otherwise get nothing.
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_one_active_membership_per_customer"' } }) }) }));
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 222, product_id: 111 }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      if (t === 'audit_log') return { insert: auditInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o9', shopify_order_id: 999, customer_id: 'c1', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(false);
    expect(res.conflict).toBe('active_membership_exists');
    expect(slotInsert).not.toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'membership_provision_conflict' }),
    );
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

  it('provisions pairs_total from the MATCHED tier (Duo → 2 slots), not a hardcoded count', async () => {
    const duoPlan = { ...activePlan, id: 'plan-duo', shopify_variant_id: 333, pairs_count: 2 };
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'mem-duo' }, error: null }) }) }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 333, product_id: 111, sku: 'SUB-2PAIR' }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan, duoPlan], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o-duo', shopify_order_id: 557, customer_id: 'c3', customer_email: 'd@e.com', currency: 'usd', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(true);
    expect(membershipInsert).toHaveBeenCalledWith(expect.objectContaining({ pairs_total: 2, plan_id: 'plan-duo' }));
    const slotCalls = slotInsert.mock.calls as unknown as unknown[][];
    expect(slotCalls[0][0]).toHaveLength(2);
  });

  it('audit-logs loudly when a SUB- SKU is purchased but no plan row matches', async () => {
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 999, product_id: 999, sku: 'SUB-2PAIR' }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'audit_log') return { insert: auditInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o-bad', shopify_order_id: 558, customer_id: 'c4', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(false);
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'membership_provision_failed',
      entity_id: 'o-bad',
    }));
  });

  it('stays silent for non-membership orders with no plan match (no audit noise)', async () => {
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ variant_id: 999, product_id: 999, sku: 'GV-AVIATOR' }], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'audit_log') return { insert: auditInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const res = await provisionMembershipFromOrder({ id: 'o-frame', shopify_order_id: 559, customer_id: 'c5', financial_status: 'paid' } as never, supabase as never);
    expect(res.provisioned).toBe(false);
    expect(auditInsert).not.toHaveBeenCalled();
  });

  // ---- Task 7: purchase-time configured pairs wired into provisioning ----

  // Like happyMocks, but the membership line item carries an arbitrary
  // pair_configs payload (raw DB jsonb) so the auto-redeem branch engages.
  function happyMocksWithLineItem(
    lineItem: Record<string, unknown>,
    priorComms: Array<{ metadata: unknown; status: string }> = [],
  ) {
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'mem-1' }, error: null }) }) }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    const commsInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'comm-1' }, error: null }) }) }));
    const commsUpdate = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    const auditInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') return { select: () => ({ eq: () => Promise.resolve({ data: [lineItem], error: null }) }) };
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      if (t === 'customers') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { first_name: 'Dev', email: 'a@b.com' }, error: null }) }) }) };
      if (t === 'communications') return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: priorComms, error: null }) }) }), insert: commsInsert, update: commsUpdate };
      if (t === 'audit_log') return { insert: auditInsert };
      return table({});
    });
    return { membershipInsert, slotInsert, commsInsert, commsUpdate, auditInsert };
  }

  it('auto-redeems configured pairs after provisioning and skips slot_unlocked when none remain', async () => {
    const pairConfigs = [
      { v: 100, h: 'aviator-a', l: 'non_rx', u: [], t: 'none' },
      { v: 101, h: 'aviator-b', l: 'non_rx', u: [], t: 'none' },
      { v: 102, h: 'aviator-c', l: 'non_rx', u: [], t: 'none' },
    ];
    autoRedeemConfiguredPairs.mockResolvedValueOnce({ redeemed: 3, fallbacks: 0 });
    const shipTo = { country_code: 'US' };
    const { commsInsert } = happyMocksWithLineItem({ variant_id: 222, product_id: 111, sku: 'SUB-3PAIR', pair_configs: pairConfigs });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const order = { id: 'o1', shopify_order_id: 555, customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd', financial_status: 'paid', shipping_address: shipTo };
    const res = await provisionMembershipFromOrder(order as never, supabase as never);
    expect(res.provisioned).toBe(true);
    expect(autoRedeemConfiguredPairs).toHaveBeenCalledTimes(1);
    expect(autoRedeemConfiguredPairs).toHaveBeenCalledWith(
      pairConfigs,
      expect.objectContaining({ membershipId: 'mem-1', orderId: 'o1', shipTo }),
      supabase,
    );
    const commTypes = commsInsert.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(commTypes).toContain('membership_welcome');
    expect(commTypes).not.toContain('slot_unlocked');
  });

  it('sends slot_unlocked when some pairs remain open (1 configured of 3)', async () => {
    const pairConfigs = [{ v: 100, h: 'aviator-a', l: 'non_rx', u: [], t: 'none' }];
    autoRedeemConfiguredPairs.mockResolvedValueOnce({ redeemed: 1, fallbacks: 0 });
    const shipTo = { country_code: 'US' };
    const { commsInsert } = happyMocksWithLineItem({ variant_id: 222, product_id: 111, sku: 'SUB-3PAIR', pair_configs: pairConfigs });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const order = { id: 'o1', shopify_order_id: 555, customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd', financial_status: 'paid', shipping_address: shipTo };
    const res = await provisionMembershipFromOrder(order as never, supabase as never);
    expect(res.provisioned).toBe(true);
    expect(autoRedeemConfiguredPairs).toHaveBeenCalledWith(
      pairConfigs,
      expect.objectContaining({ membershipId: 'mem-1', orderId: 'o1', shipTo }),
      supabase,
    );
    const commTypes = commsInsert.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(commTypes).toContain('slot_unlocked');
  });

  it('invalid pair_configs json in DB provisions membership with all slots open (fail-safe)', async () => {
    const { slotInsert, auditInsert } = happyMocksWithLineItem({
      variant_id: 222, product_id: 111, sku: 'SUB-3PAIR', pair_configs: [{ v: 'bad' }],
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const order = { id: 'o1', shopify_order_id: 555, customer_id: 'c1', customer_email: 'a@b.com', currency: 'usd', financial_status: 'paid', shipping_address: { country_code: 'US' } };
    const res = await provisionMembershipFromOrder(order as never, supabase as never);
    expect(res.provisioned).toBe(true);
    expect(autoRedeemConfiguredPairs).not.toHaveBeenCalled();
    const slotCalls = slotInsert.mock.calls as unknown as unknown[][];
    expect(slotCalls[0][0]).toHaveLength(3);
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'auto_redeem_configs_invalid' }));
  });

  it('duplicate delivery does not auto-redeem twice (idempotency short-circuit)', async () => {
    const membershipInsert = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }));
    const slotInsert = vi.fn(() => Promise.resolve({ error: null }));
    from.mockImplementation((t: string) => {
      if (t === 'order_line_items') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ variant_id: 222, product_id: 111, sku: 'SUB-3PAIR', pair_configs: [{ v: 100, h: 'aviator-a', l: 'non_rx', u: [], t: 'none' }] }],
              error: null,
            }),
          }),
        };
      }
      if (t === 'subscription_plans') return { select: () => ({ eq: () => Promise.resolve({ data: [activePlan], error: null }) }) };
      if (t === 'subscription_memberships') return { insert: membershipInsert };
      if (t === 'subscription_redemptions') return { insert: slotInsert };
      return table({});
    });
    const { provisionMembershipFromOrder } = await import('@/features/subscriptions/provision-membership');
    const order = { id: 'o1', shopify_order_id: 555, customer_id: 'c1', financial_status: 'paid', shipping_address: { country_code: 'US' } };
    const res = await provisionMembershipFromOrder(order as never, supabase as never);
    expect(res.provisioned).toBe(false);
    expect(slotInsert).not.toHaveBeenCalled();
    expect(autoRedeemConfiguredPairs).not.toHaveBeenCalled();
  });
});
