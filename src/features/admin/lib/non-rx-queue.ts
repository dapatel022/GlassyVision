import type { SupabaseClient } from '@supabase/supabase-js';

export interface NonRxQueueItem {
  lineItemId: string;
  orderId: string;
  orderNumber: string | null;
  productTitle: string;
  sku: string | null;
  country: string | null;
}

interface CandidateRow {
  id: string;
  order_id: string;
  sku: string | null;
  product_title: string;
  is_rx_required: boolean;
  orders: {
    shopify_order_number: string | null;
    financial_status: string | null;
    fulfillment_status: string | null;
    shipping_address: { country_code?: string } | null;
  } | null;
}

/**
 * Line items awaiting non-Rx release to the lab: paid, non-Rx, in a
 * not-yet-shipped/cancelled order, and without a work order yet. Both sources
 * surface here — storefront sunglasses line items and subscription synthesized
 * line items (their orders are financial_status='paid', order_source='subscription').
 *
 * The paid / not-shipped filter is applied in JS because PostgREST cannot filter
 * on an embedded relation's columns in the same select; volumes are admin-scale.
 */
export async function getNonRxQueueItems(supabase: SupabaseClient): Promise<NonRxQueueItem[]> {
  const { data: candidates } = await supabase
    .from('order_line_items')
    .select('id, order_id, sku, product_title, is_rx_required, orders ( shopify_order_number, financial_status, fulfillment_status, shipping_address )')
    .eq('is_rx_required', false);

  const rows = (candidates ?? []) as unknown as CandidateRow[];

  const paidPending = rows.filter(
    (r) =>
      r.orders?.financial_status === 'paid' &&
      r.orders?.fulfillment_status !== 'shipped' &&
      r.orders?.fulfillment_status !== 'cancelled',
  );

  const lineItemIds = paidPending.map((r) => r.id);
  const { data: existing } = await supabase
    .from('work_orders')
    .select('line_item_id')
    .eq('requires_rx', false)
    .in('line_item_id', lineItemIds.length > 0 ? lineItemIds : ['00000000-0000-0000-0000-000000000000']);
  const released = new Set(((existing ?? []) as Array<{ line_item_id: string }>).map((w) => w.line_item_id));

  return paidPending
    .filter((r) => !released.has(r.id))
    .map((r) => ({
      lineItemId: r.id,
      orderId: r.order_id,
      orderNumber: r.orders?.shopify_order_number ?? null,
      productTitle: r.product_title,
      sku: r.sku,
      country: r.orders?.shipping_address?.country_code ?? null,
    }));
}
