import type { SupabaseClient } from '@supabase/supabase-js';
import { createRedemptionFulfillmentOrder } from '@/features/subscriptions/redemption-order';

/** Statuses meaning the redemption already advanced past pending_payment. */
const ADVANCED_STATUSES = ['awaiting_rx', 'awaiting_fulfillment', 'in_review', 'in_production', 'shipped', 'delivered'];

/**
 * Record a captured add-on payment that could not be turned into fulfillment, so
 * an admin can refund or manually resolve it. This is invoked when Shopify has
 * the customer's money (orders/paid fired) but the redemption can't be advanced
 * — otherwise the payment would silently vanish (no order, no surface).
 */
async function flagAddonPayment(
  supabase: SupabaseClient,
  redemptionId: string,
  addonShopifyOrderId: number,
  reason: string,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    user_id: null,
    action: 'addon_payment_unresolved',
    entity_type: 'subscription_redemptions',
    entity_id: redemptionId,
    after_data: { reason, add_on_shopify_order_id: addonShopifyOrderId },
  });
  if (error) {
    console.error('[confirm-addon-payment] flag insert failed', { redemptionId, reason, error });
  }
}

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
    // A replay for an already-advanced slot is a benign no-op. But if the slot
    // was swept/reverted before this payment landed (e.g. the customer paid
    // after the pending_payment TTL), the money is captured with no fulfillment
    // — flag it so an admin can refund or re-redeem (audit black-hole fix).
    if (!ADVANCED_STATUSES.includes(redemption.status)) {
      await flagAddonPayment(supabase, redemptionId, addonShopifyOrderId, `slot_${redemption.status}_when_paid`);
    }
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
      // Money captured but the paid items don't match the required surcharge —
      // surface for admin rather than silently dropping the payment.
      await flagAddonPayment(supabase, redemptionId, addonShopifyOrderId, 'missing_required_variant');
      return { advanced: false, reason: 'missing_required_variant' };
    }
  }

  // Product subtotal (excludes shipping/tax) must cover the expected surcharge.
  // Defense in depth: when this redemption requires surcharge variants, a $0
  // product subtotal can never satisfy the check even if `expected_surcharge`
  // were mis-recorded as 0 — a fully-discounted/free add-on cart cannot pass.
  if (Number(facts.paidSubtotal) < expected || (requiredVariantIds.length > 0 && Number(facts.paidSubtotal) <= 0)) {
    console.warn('[confirm-addon-payment] underpayment, not advancing', {
      redemptionId,
      paidSubtotal: facts.paidSubtotal,
      expected,
    });
    // Captured an underpayment — flag for admin (refund the difference or void).
    await flagAddonPayment(supabase, redemptionId, addonShopifyOrderId, 'amount_too_low');
    return { advanced: false, reason: 'amount_too_low' };
  }

  // `currency` lives on the membership; `customer_email` is NOT a membership
  // column — it lives on `customers`, joined here via the FK embed.
  const { data: membership } = await supabase
    .from('subscription_memberships')
    .select('customer_id, currency, customers ( email )')
    .eq('id', redemption.membership_id)
    .maybeSingle();

  const membershipRow = membership as unknown as {
    customer_id: string | null;
    currency: string | null;
    customers: { email: string | null } | null;
  } | null;

  const { orderId, lineItemId, hasRxItems } = await createRedemptionFulfillmentOrder(
    {
      id: redemption.id,
      frame_variant_id: redemption.frame_variant_id,
      lens_config: (redemption.lens_config ?? {}) as Record<string, unknown>,
      ship_to: (redemption.ship_to ?? null) as { country_code?: string } | null,
      membership: {
        customer_id: membershipRow?.customer_id ?? null,
        customer_email: membershipRow?.customers?.email ?? null,
        currency: membershipRow?.currency ?? 'usd',
      },
    },
    supabase,
  );

  await supabase
    .from('subscription_redemptions')
    .update({
      // Rx pairs await the customer's prescription; non-Rx pairs (plano /
      // sunglasses) are committed and wait in the admin non-Rx queue for release
      // to the lab — never stranded in awaiting_rx.
      status: hasRxItems ? 'awaiting_rx' : 'awaiting_fulfillment',
      internal_order_id: orderId,
      internal_line_item_id: lineItemId,
      add_on_shopify_order_id: addonShopifyOrderId,
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', redemptionId);

  return { advanced: true };
}
