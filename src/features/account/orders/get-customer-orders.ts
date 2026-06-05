import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// One-time (non-subscription) order history for a customer.
//
// SECURITY — `customer_id = customerId` is the scoping filter and IS the
// authorization. The page passes the service-role admin client (which bypasses
// RLS), so this filter must never be dropped: it is the only thing preventing
// one customer from seeing another's orders. `order_source != 'subscription'`
// keeps synthesized subscription fulfillment orders out of the one-time list
// (subscription pairs surface on /account/subscription instead).

export interface CustomerOrderLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  financialStatus: string;
  fulfillmentStatus: string;
  total: number;
  currency: string;
  lineItems: CustomerOrderLineItem[];
}

interface OrderRow {
  id: string;
  shopify_order_number: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string;
  total: number | string | null;
  currency: string;
  order_line_items: Array<{
    id: string;
    product_title: string;
    variant_title: string | null;
    quantity: number;
  }> | null;
}

export async function getCustomerOrders(
  customerId: string,
  supabase: SupabaseClient<Database>,
): Promise<CustomerOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select(
      'id, shopify_order_number, created_at, financial_status, fulfillment_status, total, currency, order_line_items ( id, product_title, variant_title, quantity )',
    )
    .eq('customer_id', customerId)
    .neq('order_source', 'subscription')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as unknown as OrderRow[];

  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.shopify_order_number,
    createdAt: r.created_at,
    financialStatus: r.financial_status,
    fulfillmentStatus: r.fulfillment_status,
    total: Number(r.total ?? 0),
    currency: r.currency,
    lineItems: (r.order_line_items ?? []).map((li) => ({
      id: li.id,
      title: li.product_title,
      variantTitle: li.variant_title,
      quantity: li.quantity,
    })),
  }));
}
