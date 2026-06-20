'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import { isDispensableDestination } from '@/lib/rx/market';
import { advanceRedemptionForOrder } from '@/features/subscriptions/advance-redemption';
import { buildWorkOrderNumber } from '@/features/admin/lib/work-order-number';
import type { Json } from '@/lib/supabase/types';

export type GenerateNonRxWorkOrderResult =
  | { success: true; workOrderId: string; workOrderNumber: string }
  | { success: false; error: string };

/**
 * Release a NON-prescription line item to the lab. Mirror of generateWorkOrder
 * for items with no Rx (plain sunglasses / plano). Admin-gated; the admin's
 * "Release to lab" click and work-order generation collapse into one step here
 * (there is no Rx review in between), so released_to_lab_at is set now.
 *
 * The compliance invariant is preserved by construction: requires_rx=false +
 * rx_file_id=null is exactly the row the conditional CHECK (migration 00036)
 * permits, and createShipment skips the Rx gates only when requires_rx=false.
 */
export async function generateNonRxWorkOrder(lineItemId: string): Promise<GenerateNonRxWorkOrderResult> {
  // Auth: callable directly as a server action, so it re-verifies the admin role.
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  const supabase = createAdminClient();

  const { data: li, error: liErr } = await supabase
    .from('order_line_items')
    .select('id, order_id, sku, product_title, frame_shape, frame_color, frame_size, is_rx_required, orders ( financial_status, billing_country, shipping_address )')
    .eq('id', lineItemId)
    .single();

  if (liErr || !li) return { success: false, error: 'Line item not found' };

  const order = (li as unknown as {
    orders: { financial_status: string | null; billing_country: string | null; shipping_address: unknown } | null;
  }).orders;

  // Only non-Rx items use this path; an Rx line item must go through the Rx queue.
  if (li.is_rx_required) {
    return { success: false, error: 'This item requires a prescription — use the Rx queue.' };
  }
  // Don't commit lab time/inventory against an unpaid order.
  if (!order || order.financial_status !== 'paid') {
    return { success: false, error: 'Order is not paid' };
  }
  // Phase-1 market gate (US/CA), same as the Rx path.
  if (!isDispensableDestination(order.shipping_address as { country_code?: string } | null, order.billing_country)) {
    return { success: false, error: 'Shipping is restricted to US/CA in phase 1' };
  }

  // Idempotency: one non-Rx work order per line item (partial unique index +
  // this guard). A repeated release returns the existing work order.
  const { data: existing } = await supabase
    .from('work_orders')
    .select('id, work_order_number')
    .eq('line_item_id', lineItemId)
    .eq('requires_rx', false)
    .maybeSingle();
  if (existing) {
    return { success: true, workOrderId: existing.id, workOrderNumber: existing.work_order_number };
  }

  const { count } = await supabase
    .from('work_orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
  const workOrderNumber = buildWorkOrderNumber((count ?? 0) + 1);

  const { data: inserted, error: insertError } = await supabase
    .from('work_orders')
    .insert({
      order_id: li.order_id,
      line_item_id: li.id,
      rx_file_id: null,
      requires_rx: false,
      work_order_number: workOrderNumber,
      frame_sku: li.sku ?? 'UNKNOWN',
      frame_shape: li.frame_shape,
      frame_color: li.frame_color,
      frame_size: li.frame_size,
      lens_type: 'non_prescription',
      lens_material: 'cr39',
      coatings: [] as unknown as Json,
      tint: 'none',
      released_to_lab_at: new Date().toISOString(),
    })
    .select('id, work_order_number')
    .single();

  if (insertError || !inserted) {
    return { success: false, error: 'Failed to create work order' };
  }

  const { error: jobError } = await supabase
    .from('lab_jobs')
    .insert({ work_order_id: inserted.id, column: 'inbox', priority: 5 });
  if (jobError) {
    return { success: false, error: 'Work order created but lab job failed' };
  }

  const { error: auditError } = await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'non_rx_work_order_generated',
    entity_type: 'work_orders',
    entity_id: inserted.id,
    after_data: { work_order_number: inserted.work_order_number, line_item_id: li.id } as unknown as Json,
  });
  if (auditError) {
    console.error('[generate-non-rx-work-order] audit_log insert failed', { workOrderId: inserted.id, error: auditError });
  }

  // Mirror onto a linked subscription redemption (no-op for storefront orders,
  // whose order_id is never a redemption's internal_order_id).
  await advanceRedemptionForOrder(li.order_id, 'in_production', supabase, { workOrderId: inserted.id });

  return { success: true, workOrderId: inserted.id, workOrderNumber: inserted.work_order_number };
}
