import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks --------------------------------------------------------------
const getCurrentCustomer = vi.fn();
vi.mock('@/lib/auth/customer', () => ({
  getCurrentCustomer: () => getCurrentCustomer(),
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

const createCart = vi.fn();
vi.mock('@/lib/commerce/shopify', () => ({
  createCart: (...args: unknown[]) => createCart(...args),
}));

const createRedemptionFulfillmentOrder = vi.fn();
vi.mock('@/features/subscriptions/redemption-order', () => ({
  createRedemptionFulfillmentOrder: (...args: unknown[]) =>
    createRedemptionFulfillmentOrder(...args),
}));

// --- Builders -----------------------------------------------------------
interface BuildOpts {
  membership?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  addonOptions?: Array<Record<string, unknown>>;
  claimRows?: Array<{ id: string }>; // [] = lost the claim race
  pool?: Record<string, unknown> | null;
  // captured spies
  claimUpdate?: ReturnType<typeof vi.fn>;
  redemptionUpdate?: ReturnType<typeof vi.fn>;
  poolUpdate?: ReturnType<typeof vi.fn>;
  adjustInsert?: ReturnType<typeof vi.fn>;
}

function install(o: BuildOpts = {}) {
  const membership =
    'membership' in o ? o.membership : { id: 'mem-1', customer_id: 'cust-1', status: 'active', currency: 'usd' };
  const meta =
    'meta' in o ? o.meta : { subscription_tier: 'included', subscription_surcharge_variant_id: null };
  const addonOptions = o.addonOptions ?? [];
  const claimRows = 'claimRows' in o ? o.claimRows! : [{ id: 'slot-1' }];
  const pool = 'pool' in o ? o.pool : { id: 'pool-1', pool_quantity: 5 };

  const claimUpdate =
    o.claimUpdate ??
    vi.fn(() => ({
      eq: () => ({
        eq: () => ({
          lte: () => ({ select: () => Promise.resolve({ data: claimRows, error: null }) }),
        }),
      }),
    }));
  const redemptionUpdate =
    o.redemptionUpdate ?? vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  const poolUpdate =
    o.poolUpdate ?? vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  const adjustInsert = o.adjustInsert ?? vi.fn(() => Promise.resolve({ error: null }));

  // The slot fetch returns the redemption with the membership embedded.
  const slotRow = {
    id: 'slot-1',
    status: 'available',
    membership_id: 'mem-1',
    subscription_memberships: membership,
  };

  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'subscription_redemptions':
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: slotRow, error: null }) }) }),
          update: (patch: Record<string, unknown>) => {
            // The atomic claim sets status='locked'; the revert/advance sets other things.
            if (patch.status === 'locked') return (claimUpdate as (p: unknown) => unknown)(patch);
            return (redemptionUpdate as (p: unknown) => unknown)(patch);
          },
        };
      case 'product_metadata':
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: meta, error: null }) }) }) };
      case 'subscription_addon_options':
        return { select: () => ({ in: () => Promise.resolve({ data: addonOptions, error: null }) }) };
      case 'inventory_pool':
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: pool, error: null }) }) }),
          update: poolUpdate,
        };
      case 'inventory_adjustments':
        return { insert: adjustInsert };
      default:
        return {};
    }
  });

  return { claimUpdate, redemptionUpdate, poolUpdate, adjustInsert };
}

const baseInput = {
  slotId: 'slot-1',
  frameVariantId: 222,
  lensConfig: { lens_type: 'single_vision' },
  shipTo: { country_code: 'US' },
  addonKeys: [] as string[],
};

beforeEach(() => {
  getCurrentCustomer.mockReset();
  mockFrom.mockReset();
  createCart.mockReset();
  createRedemptionFulfillmentOrder.mockReset();
  getCurrentCustomer.mockResolvedValue({ id: 'cust-1', email: 'a@b.com', authUserId: 'au-1' });
  createRedemptionFulfillmentOrder.mockResolvedValue({ orderId: 'ord-1', lineItemId: 'li-1' });
});

describe('startRedemption', () => {
  it('rejects an unauthenticated caller', async () => {
    getCurrentCustomer.mockResolvedValue(null);
    install();
    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    const res = await startRedemption(baseInput);
    expect(res.error).toBeTruthy();
    expect(res.ok).toBeFalsy();
  });

  it('rejects a slot that belongs to another customer (IDOR)', async () => {
    install({ membership: { id: 'mem-9', customer_id: 'cust-OTHER', status: 'active', currency: 'usd' } });
    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    const res = await startRedemption(baseInput);
    expect(res.error).toBeTruthy();
    expect(res.ok).toBeFalsy();
    // must never have attempted to claim the slot
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('rejects when the membership is not active', async () => {
    install({ membership: { id: 'mem-1', customer_id: 'cust-1', status: 'expired', currency: 'usd' } });
    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    const res = await startRedemption(baseInput);
    expect(res.error).toBeTruthy();
  });

  it('rejects a non-US/CA destination', async () => {
    install();
    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    const res = await startRedemption({ ...baseInput, shipTo: { country_code: 'GB' } });
    expect(res.error).toBeTruthy();
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('errors when the atomic claim returns zero rows (already taken)', async () => {
    install({ claimRows: [] });
    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    const res = await startRedemption(baseInput);
    expect(res.error).toBeTruthy();
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('covered ($0) path: claims, reserves, creates fulfillment order, no cart', async () => {
    const spies = install();
    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    const res = await startRedemption(baseInput);
    expect(res.ok).toBe(true);
    expect(res.checkoutUrl).toBeUndefined();
    // atomic claim ran
    expect(spies.claimUpdate).toHaveBeenCalled();
    // inventory reserved with the system reason + null user
    expect(spies.adjustInsert).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -1, reason: 'subscription_reserved', user_id: null }),
    );
    // synthesized order created
    expect(createRedemptionFulfillmentOrder).toHaveBeenCalled();
    // no Shopify cart for a covered pair
    expect(createCart).not.toHaveBeenCalled();
  });

  it('out of stock: reverts the slot to available and errors (no stuck lock)', async () => {
    const spies = install({ pool: { id: 'pool-1', pool_quantity: 0 } });
    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    const res = await startRedemption(baseInput);
    expect(res.error).toBeTruthy();
    // slot reverted back to available
    expect(spies.redemptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'available' }),
    );
    // never created a fulfillment order
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('surcharge (>0) path: premium frame + addon → pending_payment + checkoutUrl', async () => {
    createCart.mockResolvedValue({ checkoutUrl: 'https://shop/checkout/abc' });
    const spies = install({
      meta: { subscription_tier: 'premium', subscription_surcharge_variant_id: 9001 },
      addonOptions: [{ key: 'progressive', shopify_variant_id: 8001, price: 40 }],
    });
    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    const res = await startRedemption({ ...baseInput, addonKeys: ['progressive'] });
    expect(res.ok).toBe(true);
    expect(res.checkoutUrl).toBe('https://shop/checkout/abc');
    // pending_payment state with expected_surcharge set on the claim
    expect(spies.claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'locked', expected_surcharge: expect.any(Number), is_premium: true }),
    );
    // moved to pending_payment after reserve
    expect(spies.redemptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending_payment' }),
    );
    // cart built with the redemption_id attribute on each line
    const cartLines = createCart.mock.calls[0][0] as Array<{ merchandiseId: string; attributes?: Array<{ key: string; value: string }> }>;
    expect(cartLines.length).toBe(2); // surcharge variant + addon variant
    for (const line of cartLines) {
      expect(line.attributes).toEqual(expect.arrayContaining([{ key: 'redemption_id', value: 'slot-1' }]));
    }
    // no synthesized order yet — that happens on add-on payment confirmation
    expect(createRedemptionFulfillmentOrder).not.toHaveBeenCalled();
  });

  it('persists required surcharge variant ids on lens_config for webhook reconciliation', async () => {
    createCart.mockResolvedValue({ checkoutUrl: 'https://shop/checkout/abc' });
    const spies = install({
      meta: { subscription_tier: 'premium', subscription_surcharge_variant_id: 9001 },
      addonOptions: [{ key: 'progressive', shopify_variant_id: 8001, price: 40 }],
    });
    const { startRedemption } = await import('@/features/subscriptions/actions/start-redemption');
    await startRedemption({ ...baseInput, addonKeys: ['progressive'] });
    // The atomic claim must stamp the premium-frame surcharge variant + each
    // selected add-on variant onto lens_config, preserving existing lens fields.
    const claimPatch = spies.claimUpdate.mock.calls[0][0] as { lens_config: Record<string, unknown> };
    expect(claimPatch.lens_config).toEqual(
      expect.objectContaining({
        lens_type: 'single_vision',
        addon_variant_ids: [9001, 8001],
      }),
    );
  });
});
