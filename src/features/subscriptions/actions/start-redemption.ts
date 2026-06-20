'use server';

import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCart } from '@/lib/commerce/shopify';
import { createRedemptionFulfillmentOrder } from '@/features/subscriptions/redemption-order';
import { isDispensableDestination } from '@/lib/rx/market';
import type { CartLineInput } from '@/lib/commerce/types';

const PENDING_PAYMENT_TTL_MS = 60 * 60 * 1000; // 60 minutes

export interface StartRedemptionInput {
  slotId: string;
  frameVariantId: number;
  lensConfig: Record<string, unknown>;
  shipTo: { country_code?: string; [key: string]: unknown };
  addonKeys?: string[];
}

export interface StartRedemptionResult {
  ok?: boolean;
  checkoutUrl?: string;
  error?: string;
}

/**
 * Begin redeeming a subscription pair.
 *
 * SECURITY — this is the entitlement + money surface. As a `'use server'`
 * action invoked from the client redemption form, the ownership check below IS
 * the authorization boundary:
 *  - requires an authenticated customer (`getCurrentCustomer`);
 *  - loads the slot's membership and verifies it belongs to the caller AND is
 *    active — a guessed `slotId` for someone else's membership is rejected
 *    before any state changes (IDOR defense);
 *  - claims the slot with a conditional UPDATE (`status='available' AND
 *    unlocks_at<=now()`) so two concurrent calls cannot both win (no double-spend);
 *  - reserves inventory and, on out-of-stock, reverts the slot so no lock is
 *    left stranded.
 *
 * The surcharge for a premium frame / lens add-ons is collected via a SECOND
 * Shopify checkout; the synthesized fulfillment order is only created once that
 * payment is confirmed (amount-verified) on the webhook (see confirm-addon-payment).
 * Covered ($0) pairs skip payment and create the order immediately.
 */
export async function startRedemption(
  input: StartRedemptionInput,
): Promise<StartRedemptionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { error: 'You must be signed in to redeem a pair.' };

  // Destination market gate (Rx eyewear → US/CA only in phase 1). Refuse early,
  // before claiming the slot, so a bad destination never strands a lock.
  if (!isDispensableDestination(input.shipTo, null)) {
    return { error: 'We can only ship prescription eyewear to the US and Canada right now.' };
  }

  const supabase = createAdminClient();

  // 1. Load the slot + its membership; verify ownership + active membership.
  // `currency` lives on the membership; `customer_email` is NOT a membership
  // column — it lives on `customers`, joined here via the FK embed.
  const { data: slot } = await supabase
    .from('subscription_redemptions')
    .select('id, status, membership_id, subscription_memberships ( id, customer_id, status, currency, customers ( email ) )')
    .eq('id', input.slotId)
    .maybeSingle();

  const membership = (slot as unknown as {
    subscription_memberships: {
      id: string;
      customer_id: string | null;
      status: string;
      currency: string | null;
      customers: { email: string | null } | null;
    } | null;
  } | null)?.subscription_memberships ?? null;

  if (!slot || !membership) return { error: 'This pair is not available.' };
  // IDOR guard: the slot's membership MUST belong to the authenticated caller.
  if (membership.customer_id !== customer.id) {
    return { error: 'This pair is not available.' };
  }
  // Active OR grace may redeem: the account page surfaces unredeemed pairs for
  // both, and a grace-period member still holds a valid (just-lapsed) membership
  // within the grace window. Disputed/frozen/terminal states cannot redeem.
  if (membership.status !== 'active' && membership.status !== 'grace') {
    return { error: 'Your subscription is not active.' };
  }

  // 2. Compute the surcharge (premium frame surcharge variant + lens add-ons).
  const { data: meta } = await supabase
    .from('product_metadata')
    .select('subscription_tier, subscription_surcharge_variant_id, subscription_surcharge_price')
    .eq('shopify_variant_id', input.frameVariantId)
    .maybeSingle();

  const isPremium = meta?.subscription_tier === 'premium';
  const surchargeVariantId = isPremium ? meta?.subscription_surcharge_variant_id ?? null : null;
  const premiumSurchargePrice = isPremium ? Number(meta?.subscription_surcharge_price ?? 0) : 0;

  const addonKeys = input.addonKeys ?? [];
  let addons: Array<{ shopify_variant_id: number | null; price: number }> = [];
  if (addonKeys.length > 0) {
    const { data } = await supabase
      .from('subscription_addon_options')
      .select('key, shopify_variant_id, price')
      .in('key', addonKeys);
    addons = (data ?? []) as Array<{ shopify_variant_id: number | null; price: number }>;
  }

  const addonTotal = addons.reduce((sum, a) => sum + Number(a.price || 0), 0);
  // Expected surcharge = premium-frame surcharge (the authoritative
  // `subscription_surcharge_price`, set post-deploy alongside the surcharge
  // variant id) + lens add-on prices. The webhook reconciles the PAID subtotal
  // against this AND requires each surcharge variant to be present (each pinning
  // its real Shopify-enforced price), so a cheap substitute can't satisfy it.
  const expectedSurcharge = premiumSurchargePrice + addonTotal;

  const hasSurcharge = !!surchargeVariantId || addons.some((a) => a.shopify_variant_id);

  // Required surcharge variant ids — persisted onto the redemption so the
  // `orders/paid` webhook can reconcile the paid order's line items against the
  // EXACT variants we required (each pinning its real Shopify-enforced price).
  // Stored under the existing lens_config jsonb to avoid a new migration; the
  // existing lens fields are preserved.
  const addonVariantIds: number[] = [
    ...(surchargeVariantId ? [Number(surchargeVariantId)] : []),
    ...addons
      .map((a) => a.shopify_variant_id)
      .filter((id): id is number => id != null)
      .map((id) => Number(id)),
  ];
  const lensConfigWithVariants: Record<string, unknown> = {
    ...input.lensConfig,
    addon_variant_ids: addonVariantIds,
  };

  // 3. Atomic claim — only succeeds if the slot is still available AND unlocked.
  const { data: claimed } = await supabase
    .from('subscription_redemptions')
    .update({
      status: 'locked',
      frame_variant_id: input.frameVariantId,
      lens_config: lensConfigWithVariants as never,
      ship_to: input.shipTo as never,
      expected_surcharge: expectedSurcharge,
      is_premium: isPremium,
    })
    .eq('id', input.slotId)
    .eq('status', 'available')
    .lte('unlocks_at', new Date().toISOString())
    .select('id');

  if (!claimed || claimed.length === 0) {
    return { error: 'This pair is not available.' };
  }

  // 4. Reserve inventory ATOMICALLY (audit C8). The RPC's conditional
  // `UPDATE ... WHERE pool_quantity > 0 RETURNING` makes the decrement race-safe
  // — two concurrent redemptions of the last unit can't both succeed — and writes
  // the ledger row in the same statement. NULL means out of stock / no pool row;
  // on that, REVERT the slot so no lock is stuck.
  const { data: reservedPoolId, error: reserveErr } = await supabase.rpc('reserve_inventory_unit', {
    p_variant_id: input.frameVariantId,
    p_reason: 'subscription_reserved',
    p_redemption_id: input.slotId,
    p_notes: `Subscription reservation for redemption ${input.slotId}`,
  });

  if (reserveErr || !reservedPoolId) {
    await supabase
      .from('subscription_redemptions')
      .update({
        status: 'available',
        frame_variant_id: null,
        expected_surcharge: 0,
        is_premium: false,
        // Match the abandoned-slot sweeper: clear all per-pick PII/config so a
        // reverted slot leaves no stale prescription/ship-to behind.
        lens_config: {} as never,
        ship_to: null,
      })
      .eq('id', input.slotId);
    return { error: 'That frame is out of stock. Please choose another.' };
  }

  // 5. Fork on surcharge.
  if (!hasSurcharge && expectedSurcharge === 0) {
    // Covered pair — create the synthesized fulfillment order immediately.
    const { orderId, lineItemId, hasRxItems } = await createRedemptionFulfillmentOrder(
      {
        id: input.slotId,
        frame_variant_id: input.frameVariantId,
        lens_config: input.lensConfig,
        ship_to: input.shipTo,
        membership: { customer_id: customer.id, customer_email: customer.email, currency: membership.currency },
      },
      supabase,
    );

    await supabase
      .from('subscription_redemptions')
      .update({
        // Rx pairs await the customer's prescription; non-Rx pairs (plano /
        // sunglasses) are committed and wait in the admin non-Rx queue for
        // release to the lab — never stranded in awaiting_rx.
        status: hasRxItems ? 'awaiting_rx' : 'awaiting_fulfillment',
        internal_order_id: orderId,
        internal_line_item_id: lineItemId,
        redeemed_at: new Date().toISOString(),
      })
      .eq('id', input.slotId);

    return { ok: true };
  }

  // Surcharge pair — move to pending_payment and hand off to a Shopify checkout.
  const lines: CartLineInput[] = [];
  if (surchargeVariantId) {
    lines.push({
      merchandiseId: `gid://shopify/ProductVariant/${surchargeVariantId}`,
      quantity: 1,
      attributes: [{ key: 'redemption_id', value: input.slotId }],
    });
  }
  for (const addon of addons) {
    if (addon.shopify_variant_id) {
      lines.push({
        merchandiseId: `gid://shopify/ProductVariant/${addon.shopify_variant_id}`,
        quantity: 1,
        attributes: [{ key: 'redemption_id', value: input.slotId }],
      });
    }
  }

  await supabase
    .from('subscription_redemptions')
    .update({
      status: 'pending_payment',
      pending_payment_expires_at: new Date(Date.now() + PENDING_PAYMENT_TTL_MS).toISOString(),
    })
    .eq('id', input.slotId);

  const cart = await createCart(lines);
  return { ok: true, checkoutUrl: cart.checkoutUrl };
}
