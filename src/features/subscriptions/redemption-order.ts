import type { SupabaseClient } from '@supabase/supabase-js';

interface ShipTo {
  country_code?: string;
  [key: string]: unknown;
}

interface MembershipInfo {
  customer_id: string | null;
  customer_email?: string | null;
  currency?: string | null;
}

interface RedemptionInput {
  id: string;
  frame_variant_id: number | null;
  lens_config: Record<string, unknown> | null;
  ship_to: ShipTo | null;
  /**
   * Fallback destination signal for the synthesized order's `billing_country`
   * when `ship_to` itself carries no `country_code` — e.g. auto-redeem's
   * billing-country fallback (see `AutoRedeemContext.billingCountry` /
   * `isDispensableDestination`). Without threading this through, a pair
   * admitted by that fallback would synthesize an order with a NULL
   * `billing_country`, and every downstream gate
   * (`generate-work-order.ts`, `generate-non-rx-work-order.ts`,
   * `create-shipment.ts`) re-checks `isDispensableDestination(shipping_address,
   * billing_country)` against `(no country_code, null)` and fails closed —
   * stranding a paid, stock-reserved, redeemed slot with no path to a work
   * order or shipment. `startRedemption` and `confirmAddonPayment` never pass
   * this: their `ship_to` is guaranteed to carry a `country_code` by their own
   * front-door gate (`isDispensableDestination(shipTo, null)`), so the
   * fallback is inert for those callers.
   */
  billingCountry?: string | null;
  membership: MembershipInfo;
}

/**
 * Keystone 1: synthesize an internal `orders` + `order_line_items` row for a
 * subscription redemption so it flows through the unchanged Rx→review→lab→ship
 * pipeline. These rows carry NO Shopify ids (`order_source='subscription'`,
 * `shopify_order_id=null`, `shopify_line_item_id=null`), which the ship-side
 * Shopify fulfillment push already skips (guarded on a truthy line-item id).
 *
 * Destination compliance: `billing_country` is derived from the redemption's
 * `ship_to.country_code` (lowercased), falling back to `redemption.billingCountry`
 * when the ship-to address carries no country_code of its own — mirroring
 * `isDispensableDestination`'s own fallback exactly, so the synthesized order
 * never loses the destination signal that admitted it in the first place. The
 * DB CHECK only permits `us`/`ca`; the destination market gate (in
 * `startRedemption` / `autoRedeemConfiguredPairs`) rejects non-US/CA
 * destinations BEFORE this runs, so US/CA is assumed here — but we still
 * lowercase.
 */
export async function createRedemptionFulfillmentOrder(
  redemption: RedemptionInput,
  supabase: SupabaseClient,
): Promise<{ orderId: string; lineItemId: string; hasRxItems: boolean }> {
  // 1. Frame spec from product_metadata (by Shopify variant id).
  const { data: meta } = await supabase
    .from('product_metadata')
    .select('sku, frame_shape, frame_material, is_rx_capable')
    .eq('shopify_variant_id', redemption.frame_variant_id)
    .maybeSingle();

  const sku: string | null = meta?.sku ?? null;
  const frameShape: string | null = meta?.frame_shape ?? null;
  const isRxCapable: boolean = meta?.is_rx_capable === true;

  // The customer wants prescription lenses unless they explicitly chose a
  // non-prescription / plano lens for an Rx-capable frame.
  const lensConfig = redemption.lens_config ?? {};
  const lensType = String((lensConfig as Record<string, unknown>).lens_type ?? '').toLowerCase();
  const wantsRx = lensType !== 'non_prescription' && lensType !== 'plano' && lensType !== 'none';
  const hasRxItems = isRxCapable && wantsRx;

  // The synthesized frame line must carry the purchased lens spec in the same
  // vocabulary as storefront orders: generateWorkOrder hard-fails on an
  // unmappable lens_type (never silently defaults a prescription spec), so a
  // NULL here would permanently block the redemption's work order.
  const lineLensType = hasRxItems ? (lensType === 'progressive' ? 'progressive' : 'single_vision') : 'non_rx';
  const rawCoatings = (lensConfig as Record<string, unknown>).coatings;
  const lineCoatings = Array.isArray(rawCoatings)
    ? rawCoatings.map(String).join(',') || null
    : typeof rawCoatings === 'string' && rawCoatings.length > 0 ? rawCoatings : null;
  const rawTint = (lensConfig as Record<string, unknown>).tint;
  const lineTint = typeof rawTint === 'string' && rawTint.length > 0 ? rawTint : null;

  const shipCountryCode = redemption.ship_to?.country_code?.trim();
  const countryCode = (shipCountryCode || redemption.billingCountry || '').toLowerCase() || null;

  // 2. Synthesized order (no Shopify ids).
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_source: 'subscription',
      shopify_order_id: null,
      shopify_order_number: `SUB-${redemption.id.slice(0, 8)}`,
      customer_id: redemption.membership.customer_id,
      customer_email: redemption.membership.customer_email ?? '',
      shipping_address: redemption.ship_to ?? null,
      billing_country: countryCode,
      currency: redemption.membership.currency ?? 'usd',
      subtotal: 0,
      total: 0,
      financial_status: 'paid',
      has_rx_items: hasRxItems,
      rx_status: hasRxItems ? 'awaiting_upload' : 'none',
    })
    .select('id')
    .single();

  if (orderErr || !order) {
    throw new Error(`Failed to create synthesized order: ${orderErr?.message ?? 'no row returned'}`);
  }

  // 3. Synthesized line item (no Shopify id).
  const { data: lineItem, error: liErr } = await supabase
    .from('order_line_items')
    .insert({
      order_id: order.id,
      shopify_line_item_id: null,
      product_title: sku ? `GlassyVision frame ${sku}` : 'GlassyVision frame',
      sku,
      quantity: 1,
      unit_price: 0,
      line_total: 0,
      is_rx_required: hasRxItems,
      frame_shape: frameShape,
      lens_type: lineLensType,
      coatings: lineCoatings,
      tint: lineTint,
    })
    .select('id')
    .single();

  if (liErr || !lineItem) {
    throw new Error(`Failed to create synthesized line item: ${liErr?.message ?? 'no row returned'}`);
  }

  return { orderId: order.id, lineItemId: lineItem.id, hasRxItems };
}
