import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyEndOfTerm } from '@/features/subscriptions/lib/end-of-term';
import type { EndOfTermMembership, EndOfTermDeps } from '@/features/subscriptions/lib/end-of-term';

/** Build a membership with sensible defaults; override per case. */
function membership(overrides: Partial<EndOfTermMembership> = {}): EndOfTermMembership {
  return {
    id: 'mem-1',
    status: 'grace',
    shopify_order_id: 555,
    currency: 'USD',
    pairs_total: 3,
    term_end: '2026-06-01T00:00:00.000Z',
    term_months: 12,
    rollover_count: 0,
    end_of_term_policy: { mode: 'expire' },
    ...overrides,
  };
}

/** Mock deps with spies; the test can inspect every side-effect. */
function makeDeps(capturedAmount = 150): {
  deps: EndOfTermDeps;
  expireSlots: ReturnType<typeof vi.fn>;
  setMembership: ReturnType<typeof vi.fn>;
  createRefund: ReturnType<typeof vi.fn>;
} {
  const expireSlots = vi.fn().mockResolvedValue(undefined);
  const setMembership = vi.fn().mockResolvedValue({ error: null });
  const createRefund = vi.fn().mockResolvedValue(undefined);
  const deps: EndOfTermDeps = {
    now: () => new Date('2026-06-15T00:00:00.000Z'),
    capturedAmount,
    expireUncommittedSlots: expireSlots,
    setMembership,
    createRefund,
  };
  return { deps, expireSlots, setMembership, createRefund };
}

describe('applyEndOfTerm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expire mode: expires uncommitted slots and marks membership expired, no refund', async () => {
    const { deps, expireSlots, setMembership, createRefund } = makeDeps();
    const res = await applyEndOfTerm({
      membership: membership({ end_of_term_policy: { mode: 'expire' } }),
      uncommittedCount: 2,
      deps,
    });

    expect(res.mode).toBe('expire');
    expect(res.expired).toBe(2);
    expect(expireSlots).toHaveBeenCalledWith('mem-1');
    expect(setMembership).toHaveBeenCalledWith('mem-1', expect.objectContaining({ status: 'expired' }));
    expect(createRefund).not.toHaveBeenCalled();
  });

  it('refund mode: issues pro-rata refund, expires slots, marks refunded', async () => {
    const { deps, expireSlots, setMembership, createRefund } = makeDeps(150);
    const res = await applyEndOfTerm({
      membership: membership({ end_of_term_policy: { mode: 'refund' } }),
      uncommittedCount: 2, // 2/3 * 150 = 100
      deps,
    });

    expect(res.mode).toBe('refund');
    expect(res.expired).toBe(2);
    expect(res.refundAmount).toBe(100);
    expect(createRefund).toHaveBeenCalledWith(555, 100, 'USD', expect.any(String));
    expect(expireSlots).toHaveBeenCalledWith('mem-1');
    expect(setMembership).toHaveBeenCalledWith('mem-1', expect.objectContaining({ status: 'refunded' }));
  });

  it('refund mode with zero refundable: still expires + marks refunded but skips refund call', async () => {
    const { deps, createRefund, setMembership } = makeDeps(150);
    const res = await applyEndOfTerm({
      membership: membership({ end_of_term_policy: { mode: 'refund' } }),
      uncommittedCount: 0,
      deps,
    });
    expect(res.mode).toBe('refund');
    expect(res.refundAmount).toBe(0);
    expect(createRefund).not.toHaveBeenCalled();
    expect(setMembership).toHaveBeenCalledWith('mem-1', expect.objectContaining({ status: 'refunded' }));
  });

  it('rollover mode (count 0): extends term, bumps rollover_count, stays active, no slot/refund change', async () => {
    const { deps, expireSlots, setMembership, createRefund } = makeDeps();
    const res = await applyEndOfTerm({
      membership: membership({ end_of_term_policy: { mode: 'rollover' }, rollover_count: 0 }),
      uncommittedCount: 2,
      deps,
    });

    expect(res.mode).toBe('rollover');
    expect(expireSlots).not.toHaveBeenCalled();
    expect(createRefund).not.toHaveBeenCalled();
    // term_end 2026-06-01 + 12 months = 2027-06-01
    expect(setMembership).toHaveBeenCalledWith(
      'mem-1',
      expect.objectContaining({ status: 'active', rollover_count: 1, term_end: '2027-06-01T00:00:00.000Z' }),
    );
  });

  it('surfaces a guard-trigger error on the terminal membership update (expire mode)', async () => {
    // If the DB guard raises on the terminal membership update (a slot raced into
    // a committed state), the error must propagate — slots were already expired,
    // so a swallowed error would hide a stuck-active membership.
    const { deps, setMembership } = makeDeps();
    setMembership.mockResolvedValue({
      error: { message: 'cannot set membership mem-1 to expired while a slot is committed' },
    });
    await expect(
      applyEndOfTerm({
        membership: membership({ end_of_term_policy: { mode: 'expire' } }),
        uncommittedCount: 1,
        deps,
      }),
    ).rejects.toThrow(/committed|blocked/i);
  });

  it('surfaces a guard-trigger error on the terminal membership update (refund mode), after the refund', async () => {
    const { deps, setMembership, createRefund } = makeDeps(150);
    setMembership.mockResolvedValue({
      error: { message: 'cannot set membership mem-1 to refunded while a slot is committed' },
    });
    await expect(
      applyEndOfTerm({
        membership: membership({ end_of_term_policy: { mode: 'refund' } }),
        uncommittedCount: 2,
        deps,
      }),
    ).rejects.toThrow(/committed|blocked/i);
    // The refund had already been issued before the blocked terminal transition.
    expect(createRefund).toHaveBeenCalled();
  });

  it('rollover mode (count 1): falls back to expire — no infinite extension', async () => {
    const { deps, expireSlots, setMembership, createRefund } = makeDeps();
    const res = await applyEndOfTerm({
      membership: membership({ end_of_term_policy: { mode: 'rollover' }, rollover_count: 1 }),
      uncommittedCount: 2,
      deps,
    });

    expect(res.mode).toBe('expire');
    expect(res.expired).toBe(2);
    expect(expireSlots).toHaveBeenCalledWith('mem-1');
    expect(setMembership).toHaveBeenCalledWith('mem-1', expect.objectContaining({ status: 'expired' }));
    expect(createRefund).not.toHaveBeenCalled();
  });
});
