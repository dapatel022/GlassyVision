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
 * `ship_to.country_code` (lowercased). The DB CHECK only permits `us`/`ca`;
 * the destination market gate in `startRedemption` (Task 4) rejects non-US/CA
 * ship-to BEFORE this runs, so US/CA is assumed here — but we still lowercase.
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

  const countryCode = (redemption.ship_to?.country_code ?? '').toLowerCase() || null;

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
    })
    .select('id')
    .single();

  if (liErr || !lineItem) {
    throw new Error(`Failed to create synthesized line item: ${liErr?.message ?? 'no row returned'}`);
  }

  return { orderId: order.id, lineItemId: lineItem.id, hasRxItems };
}
