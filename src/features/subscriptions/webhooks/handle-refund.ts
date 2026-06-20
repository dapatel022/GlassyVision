import type { SupabaseClient } from '@supabase/supabase-js';
import { releaseReservedSlots } from '@/features/subscriptions/lib/release-reserved-slots';

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
 * refund expires exactly these; committed is defined by EXCLUSION — any status
 * not in this list (awaiting_rx, awaiting_fulfillment, in_review, in_production,
 * shipped, …) is committed and runs to completion (overview §86 — a refund never
 * claws back a pair that is already being made/shipped).
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
 *  - add-on (surcharge) order → only when the redemption is still uncommitted,
 *    revert it to `available` and release its inventory reservation (mirrors the
 *    sweep-abandoned revert). A surcharge refunded after the slot committed
 *    (awaiting_rx+) is left intact and flagged in `audit_log` for manual review.
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

    // Release inventory reserved by any pending_payment slots BEFORE expiring
    // them, or the reserved frame unit is stranded.
    await releaseReservedSlots(supabase, mem.id);

    // Expire every uncommitted slot. Committed slots (awaiting_rx+) run to
    // completion and are deliberately excluded.
    await supabase
      .from('subscription_redemptions')
      .update({ status: 'expired' })
      .eq('membership_id', mem.id)
      .in('status', UNCOMMITTED_STATUSES as unknown as string[]);

    // Mark the membership refunded. The DB guard trigger blocks this if any slot
    // is still committed; PostgREST returns that as {error} (it does NOT throw),
    // so we MUST capture and surface it. Throwing makes the webhook return 5xx,
    // leaves processed_at null as a dead-letter, and Shopify retries. Swallowing
    // it would leave the customer fully refunded yet the membership `active`
    // (remaining slots stay redeemable = free glasses) with zero visibility.
    const { error: refundUpdErr } = await supabase
      .from('subscription_memberships')
      .update({ status: 'refunded' })
      .eq('id', mem.id);

    if (refundUpdErr) {
      throw new Error(
        `Failed to mark membership ${mem.id} refunded (likely a committed slot guard): ${refundUpdErr.message}`,
      );
    }

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

    // A surcharge refund may only free the slot while it is still UNCOMMITTED.
    // `add_on_shopify_order_id` is set at addon-payment time and never cleared as
    // the redemption advances (awaiting_rx → in_production → shipped → delivered),
    // so without this guard a refund issued AFTER the pair was made/shipped would
    // flip an already-fulfilled redemption back to `available` (free re-redemption)
    // and re-credit a unit of inventory that already left the building. For a
    // committed/terminal slot we leave the slot + fulfillment intact and surface
    // it for manual admin handling instead (overview §86 — a refund never claws
    // back a pair that is already being made/shipped).
    if (!(UNCOMMITTED_STATUSES as readonly string[]).includes(slot.status)) {
      await supabase.from('audit_log').insert({
        user_id: null,
        action: 'addon_refund_on_committed_slot',
        entity_type: 'subscription_redemption',
        entity_id: slot.id,
        before_data: { status: slot.status } as never,
        after_data: {
          add_on_shopify_order_id: orderId,
          note: 'Add-on surcharge refunded after the slot was committed; slot left intact — manual admin review required.',
        } as never,
      });
      return { handled: 'addon' };
    }

    // Reset the slot to available, clearing the add-on selection — mirrors the
    // sweep-abandoned revert so a refunded surcharge frees the slot for reuse.
    // Re-check the uncommitted status in the WHERE clause to close the race
    // between the read above and this write.
    // Re-check the uncommitted status in the WHERE and only release stock if THIS
    // update actually flipped the slot. If a concurrent sweep already freed it,
    // we match zero rows and must not release again (would double-credit stock).
    const { data: resetRows } = await supabase
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
      .eq('id', slot.id)
      .in('status', UNCOMMITTED_STATUSES as unknown as string[])
      .select('id');

    // Release the reserved unit of stock, if a frame was selected (atomic, C8).
    if (resetRows && resetRows.length > 0 && slot.frame_variant_id != null) {
      await supabase.rpc('release_inventory_unit', {
        p_variant_id: slot.frame_variant_id,
        p_reason: 'subscription_release',
        p_redemption_id: slot.id,
        p_notes: `Released reservation for refunded add-on on redemption ${slot.id}`,
      });
    }

    return { handled: 'addon' };
  }

  return { handled: 'none' };
}
