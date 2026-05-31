import type { SupabaseClient } from '@supabase/supabase-js';
import { createRedemptionFulfillmentOrder } from '@/features/subscriptions/redemption-order';

/**
 * Confirm a subscription add-on (surcharge) payment from the Shopify
 * `orders/paid` webhook and, IF the paid amount covers the expected surcharge,
 * advance the redemption into fulfillment.
 *
 * SECURITY — amount verification is the load-bearing check here. A redemption
 * that requires an expensive premium/upgrade surcharge must NEVER be unlocked
 * by a cheap or zero add-on payment. We:
 *  - require the redemption to still be in `pending_payment` (so a webhook
 *    replay or a payment for an already-fulfilled slot is a no-op);
 *  - require `paidAmount >= expected_surcharge`; a short payment leaves the slot
 *    untouched (it will be swept back to `available` after its TTL).
 *
 * Only the synthesized fulfillment order is created here — exactly mirroring the
 * covered ($0) path in startRedemption, so both routes converge on the same
 * Rx→review→lab→ship pipeline.
 */
export async function confirmAddonPayment(
  redemptionId: string,
  paidAmount: number,
  addonShopifyOrderId: number,
  supabase: SupabaseClient,
): Promise<{ advanced: boolean; reason?: string }> {
  const { data: redemption } = await supabase
    .from('subscription_redemptions')
    .select('id, status, membership_id, expected_surcharge, frame_variant_id, lens_config, ship_to')
    .eq('id', redemptionId)
    .maybeSingle();

  if (!redemption) return { advanced: false, reason: 'unknown_redemption' };
  if (redemption.status !== 'pending_payment') {
    return { advanced: false, reason: 'not_pending_payment' };
  }

  const expected = Number(redemption.expected_surcharge ?? 0);
  if (Number(paidAmount) < expected) {
    // Underpayment — never advance. Log for reconciliation; the sweeper will
    // release the reservation once pending_payment_expires_at lapses.
    console.warn('[confirm-addon-payment] underpayment, not advancing', {
      redemptionId,
      paidAmount,
      expected,
    });
    return { advanced: false, reason: 'amount_too_low' };
  }

  const { data: membership } = await supabase
    .from('subscription_memberships')
    .select('customer_id, customer_email, currency')
    .eq('id', redemption.membership_id)
    .maybeSingle();

  const { orderId, lineItemId } = await createRedemptionFulfillmentOrder(
    {
      id: redemption.id,
      frame_variant_id: redemption.frame_variant_id,
      lens_config: (redemption.lens_config ?? {}) as Record<string, unknown>,
      ship_to: (redemption.ship_to ?? null) as { country_code?: string } | null,
      membership: {
        customer_id: membership?.customer_id ?? null,
        customer_email: membership?.customer_email ?? null,
        currency: membership?.currency ?? 'usd',
      },
    },
    supabase,
  );

  await supabase
    .from('subscription_redemptions')
    .update({
      status: 'awaiting_rx',
      internal_order_id: orderId,
      internal_line_item_id: lineItemId,
      add_on_shopify_order_id: addonShopifyOrderId,
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', redemptionId);

  return { advanced: true };
}
