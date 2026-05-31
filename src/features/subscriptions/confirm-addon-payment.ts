import type { SupabaseClient } from '@supabase/supabase-js';
import { createRedemptionFulfillmentOrder } from '@/features/subscriptions/redemption-order';

/** Line item from the paid add-on order, reduced to what reconciliation needs. */
export interface PaidLineItem {
  variant_id: number | null | undefined;
  quantity: number | null | undefined;
}

export interface AddonPaymentFacts {
  /**
   * The PRODUCT subtotal of the paid add-on order — line-items price, EXCLUDING
   * shipping and tax. Shipping/tax must never count toward covering the
   * surcharge, or a customer could underpay an expensive premium pair and have
   * the gap papered over by an inflated shipping line.
   */
  paidSubtotal: number;
  /** The paid order's line items (variant ids + quantities). */
  lineItems: PaidLineItem[];
}

/**
 * Confirm a subscription add-on (surcharge) payment from the Shopify
 * `orders/paid` webhook and, IF the payment genuinely covers the required
 * surcharge, advance the redemption into fulfillment.
 *
 * SECURITY — payment verification is the load-bearing check here. A redemption
 * that requires an expensive premium/upgrade surcharge must NEVER be unlocked
 * by a cheap or zero add-on payment. We reconcile against BOTH:
 *  - line-item presence: every required surcharge variant id (captured at claim
 *    time on `lens_config.addon_variant_ids`) must appear in the paid order with
 *    quantity >= 1. This pins each variant's REAL Shopify-enforced price, so a
 *    cheap substitute line item can never satisfy the requirement; and
 *  - product subtotal: `paidSubtotal >= expected_surcharge`, using the
 *    line-items subtotal (NOT gross total) so shipping/tax can't inflate it.
 * We also require the redemption to still be in `pending_payment` (so a webhook
 * replay, or a payment for an already-fulfilled slot, is a no-op). Any failed
 * check leaves the redemption untouched (the sweeper releases the reservation
 * after `pending_payment_expires_at` lapses).
 *
 * Only the synthesized fulfillment order is created here — exactly mirroring the
 * covered ($0) path in startRedemption, so both routes converge on the same
 * Rx→review→lab→ship pipeline.
 */
export async function confirmAddonPayment(
  redemptionId: string,
  facts: AddonPaymentFacts,
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

  // Build a variant_id -> total quantity map from the paid order's line items.
  const paidQtyByVariant = new Map<number, number>();
  for (const item of facts.lineItems ?? []) {
    if (item.variant_id == null) continue;
    const variantId = Number(item.variant_id);
    const qty = Number(item.quantity ?? 0);
    paidQtyByVariant.set(variantId, (paidQtyByVariant.get(variantId) ?? 0) + qty);
  }

  // Required surcharge variant ids recorded at claim time (premium-frame
  // surcharge variant + each selected add-on option variant).
  const lensConfig = (redemption.lens_config ?? {}) as { addon_variant_ids?: unknown };
  const requiredVariantIds = Array.isArray(lensConfig.addon_variant_ids)
    ? lensConfig.addon_variant_ids.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : [];

  // Every required variant must be present in the paid order at quantity >= 1.
  for (const requiredId of requiredVariantIds) {
    if ((paidQtyByVariant.get(requiredId) ?? 0) < 1) {
      console.warn('[confirm-addon-payment] required surcharge variant missing, not advancing', {
        redemptionId,
        requiredId,
      });
      return { advanced: false, reason: 'missing_required_variant' };
    }
  }

  // Product subtotal (excludes shipping/tax) must cover the expected surcharge.
  if (Number(facts.paidSubtotal) < expected) {
    console.warn('[confirm-addon-payment] underpayment, not advancing', {
      redemptionId,
      paidSubtotal: facts.paidSubtotal,
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
