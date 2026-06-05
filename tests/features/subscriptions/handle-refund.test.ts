import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();

beforeEach(() => from.mockReset());

/**
 * Build a chainable thenable that resolves to `result` and records every
 * method call on `calls`. Mirrors the supabase-js fluent builder closely enough
 * for the handler's read/update/insert chains.
 */
function builder(result: unknown, calls: Record<string, unknown[]>) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      return (...args: unknown[]) => {
        (calls[prop] ??= []).push(args);
        return proxy;
      };
    },
  };
  const proxy: Record<string, unknown> = new Proxy({}, handler);
  return proxy;
}

describe('handleRefundWebhook', () => {
  it('expires uncommitted slots and marks the membership refunded', async () => {
    const membership = { id: 'mem-1', status: 'active' };
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

    from.mockImplementation((table: string) => {
      const calls: Record<string, unknown[]> = {};
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: membership, error: null }) }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === 'subscription_redemptions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return {
              eq: () => ({ in: () => Promise.resolve({ error: null }) }),
            };
          },
        };
      }
      return builder({ data: null, error: null }, calls);
    });

    const { handleRefundWebhook } = await import('@/features/subscriptions/webhooks/handle-refund');
    const res = await handleRefundWebhook({ order_id: 555 }, { from } as never);

    expect(res.handled).toBe('membership');
    // uncommitted slots expired
    expect(
      updates.some(
        (u) => u.table === 'subscription_redemptions' && u.values.status === 'expired',
      ),
    ).toBe(true);
    // membership marked refunded
    expect(
      updates.some(
        (u) => u.table === 'subscription_memberships' && u.values.status === 'refunded',
      ),
    ).toBe(true);
  });

  it('reverts an UNCOMMITTED add-on redemption to available and releases inventory', async () => {
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

    from.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      if (table === 'subscription_redemptions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: 'slot-9', frame_variant_id: 333, status: 'pending_payment' },
                  error: null,
                }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: () => ({ in: () => Promise.resolve({ error: null }) }) };
          },
        };
      }
      if (table === 'inventory_pool') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'pool-1', pool_quantity: 2 }, error: null }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === 'inventory_adjustments') {
        return {
          insert: (values: Record<string, unknown>) => {
            inserts.push({ table, values });
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    });

    const { handleRefundWebhook } = await import('@/features/subscriptions/webhooks/handle-refund');
    const res = await handleRefundWebhook({ order_id: 777 }, { from } as never);

    expect(res.handled).toBe('addon');
    expect(
      updates.some(
        (u) => u.table === 'subscription_redemptions' && u.values.status === 'available',
      ),
    ).toBe(true);
    expect(
      inserts.some(
        (i) =>
          i.table === 'inventory_adjustments' &&
          i.values.delta === 1 &&
          i.values.reason === 'subscription_release',
      ),
    ).toBe(true);
  });

  it('leaves a COMMITTED add-on redemption untouched and flags it for admin review', async () => {
    // A surcharge refunded AFTER the pair has been made/shipped must NOT free the
    // slot or re-credit inventory — that pair already left the building. The slot
    // is left intact and an audit_log row is written for manual handling.
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

    from.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      if (table === 'subscription_redemptions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: 'slot-9', frame_variant_id: 333, status: 'awaiting_rx' },
                  error: null,
                }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: () => ({ in: () => Promise.resolve({ error: null }) }) };
          },
        };
      }
      if (table === 'inventory_pool') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'pool-1', pool_quantity: 2 }, error: null }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === 'inventory_adjustments') {
        return {
          insert: (values: Record<string, unknown>) => {
            inserts.push({ table, values });
            return Promise.resolve({ error: null });
          },
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

    const { handleRefundWebhook } = await import('@/features/subscriptions/webhooks/handle-refund');
    const res = await handleRefundWebhook({ order_id: 777 }, { from } as never);

    expect(res.handled).toBe('addon');
    // No revert to available.
    expect(
      updates.some(
        (u) => u.table === 'subscription_redemptions' && u.values.status === 'available',
      ),
    ).toBe(false);
    // No inventory re-credit.
    expect(inserts.some((i) => i.table === 'inventory_adjustments')).toBe(false);
    // Flagged for manual review.
    expect(inserts.some((i) => i.table === 'audit_log')).toBe(true);
  });

  it('throws when the membership-refunded update is rejected by the committed-slot guard', async () => {
    // The DB guard trigger raises when a slot is still committed; PostgREST
    // returns that as {error}. The handler must surface it (throw) so the webhook
    // returns 5xx, leaves processed_at null (dead-letter), and Shopify retries —
    // it must NOT silently mark success while the customer is fully refunded but
    // the membership stays active = free glasses.
    from.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'mem-3', status: 'active' }, error: null }),
            }),
          }),
          update: () => ({
            eq: () =>
              Promise.resolve({
                error: { message: 'cannot set membership to refunded while a slot is committed' },
              }),
          }),
        };
      }
      if (table === 'subscription_redemptions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          update: () => ({ eq: () => ({ in: () => Promise.resolve({ error: null }) }) }),
        };
      }
      return {};
    });

    const { handleRefundWebhook } = await import('@/features/subscriptions/webhooks/handle-refund');
    await expect(handleRefundWebhook({ order_id: 555 }, { from } as never)).rejects.toThrow();
  });

  it('is a no-op for orders that match no membership or add-on', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      if (table === 'subscription_redemptions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      return {};
    });

    const { handleRefundWebhook } = await import('@/features/subscriptions/webhooks/handle-refund');
    const res = await handleRefundWebhook({ order_id: 999 }, { from } as never);
    expect(res.handled).toBe('none');
  });

  it('is idempotent: a membership already refunded is not re-processed', async () => {
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    from.mockImplementation((table: string) => {
      if (table === 'subscription_memberships') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'mem-2', status: 'refunded' }, error: null }),
            }),
          }),
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      return {};
    });

    const { handleRefundWebhook } = await import('@/features/subscriptions/webhooks/handle-refund');
    const res = await handleRefundWebhook({ order_id: 555 }, { from } as never);
    expect(res.handled).toBe('membership');
    expect(updates.length).toBe(0);
  });
});
