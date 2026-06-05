import type { SupabaseClient } from '@supabase/supabase-js';

/** The slice of a Shopify `refunds/create` payload we rely on. */
export interface RefundWebhookPayload {
  /** The Shopify order id the refund was issued against. */
  order_id?: number | null;
}

export interface RefundWebhookResult {
  handled: 'membership' | 'addon' | 'none';
  /** Number of uncommitted slots expired (membership refunds only). */
  expiredSlots?: number;
}

/**
 * Redemption statuses that are NOT yet committed to fulfillment. A membership
 * refund expires exactly these; anything past `awaiting_rx` is committed and
 * runs to completion (overview §86 — a refund never claws back a pair that is
 * already being made/shipped).
 */
const UNCOMMITTED_STATUSES = ['available', 'locked', 'pending_payment'] as const;

/**
 * React to a Shopify `refunds/create` webhook so a refund issued in the Shopify
 * admin actually reaches Supabase. Without this, a refunded customer's slots
 * would stay redeemable = free glasses (overview spec §73).
 *
 * Two cases, by which order the refund targets:
 *  - membership purchase order → membership `refunded`, uncommitted slots
 *    (`available`/`locked`/`pending_payment`) → `expired`. Committed slots
 *    (`awaiting_rx`+) are left running. Already-terminal memberships are a no-op.
 *  - add-on (surcharge) order → revert that one redemption to `available` and
 *    release its inventory reservation (mirrors the sweep-abandoned revert).
 *
 * Idempotent and a safe no-op for non-subscription orders.
 */
export async function handleRefundWebhook(
  payload: RefundWebhookPayload,
  supabase: SupabaseClient,
): Promise<RefundWebhookResult> {
  const orderId = payload.order_id;
  if (orderId == null) return { handled: 'none' };

  // --- Membership purchase order? ---
  const { data: membership } = await supabase
    .from('subscription_memberships')
    .select('id, status')
    .eq('shopify_order_id', orderId)
    .maybeSingle();

  if (membership) {
    const mem = membership as { id: string; status: string };

    // Idempotency: a membership already in a terminal money state is left
    // untouched on a re-delivered refund.
    if (['refunded', 'cancelled', 'expired'].includes(mem.status)) {
      return { handled: 'membership', expiredSlots: 0 };
    }

    // Expire every uncommitted slot. Committed slots (awaiting_rx+) run to
    // completion and are deliberately excluded.
    await supabase
      .from('subscription_redemptions')
      .update({ status: 'expired' })
      .eq('membership_id', mem.id)
      .in('status', UNCOMMITTED_STATUSES as unknown as string[]);

    // Mark the membership refunded. The DB guard trigger blocks this if any slot
    // is still committed; if it raises, the membership stays as-is for admin
    // handling (the surrounding webhook try/catch records the error).
    await supabase
      .from('subscription_memberships')
      .update({ status: 'refunded' })
      .eq('id', mem.id);

    return { handled: 'membership' };
  }

  // --- Add-on (surcharge) order? ---
  const { data: redemption } = await supabase
    .from('subscription_redemptions')
    .select('id, frame_variant_id, status')
    .eq('add_on_shopify_order_id', orderId)
    .maybeSingle();

  if (redemption) {
    const slot = redemption as {
      id: string;
      frame_variant_id: number | null;
      status: string;
    };

    // Reset the slot to available, clearing the add-on selection — mirrors the
    // sweep-abandoned revert so a refunded surcharge frees the slot for reuse.
    await supabase
      .from('subscription_redemptions')
      .update({
        status: 'available',
        frame_variant_id: null,
        lens_config: {} as never,
        ship_to: null,
        expected_surcharge: 0,
        is_premium: false,
        pending_payment_expires_at: null,
        add_on_shopify_order_id: null,
      })
      .eq('id', slot.id);

    // Release the reserved unit of stock, if a frame was selected.
    if (slot.frame_variant_id != null) {
      const { data: pool } = await supabase
        .from('inventory_pool')
        .select('id, pool_quantity')
        .eq('shopify_variant_id', slot.frame_variant_id)
        .maybeSingle();

      if (pool) {
        const poolRow = pool as { id: string; pool_quantity: number };
        await supabase.from('inventory_adjustments').insert({
          inventory_pool_id: poolRow.id,
          delta: 1,
          reason: 'subscription_release',
          user_id: null,
          notes: `Released reservation for refunded add-on on redemption ${slot.id}`,
        });
        await supabase
          .from('inventory_pool')
          .update({ pool_quantity: Number(poolRow.pool_quantity) + 1 })
          .eq('id', poolRow.id);
      }
    }

    return { handled: 'addon' };
  }

  return { handled: 'none' };
}
