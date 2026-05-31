'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isLabRole } from '@/lib/auth/middleware';
import { createFulfillment } from '@/lib/commerce/shopify-admin';

export interface CreateShipmentInput {
  jobId: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
}

const DISPENSABLE_COUNTRIES = ['us', 'ca'];

/**
 * Creates the outbound shipment for a completed lab job and marks the order
 * shipped. This is THE compliance line for the business — nothing ships
 * unless an admin-approved, non-deleted Rx image is on file, the work order
 * was released to the lab, QC photos exist, and the destination is dispensable
 * (US/CA in phase 1). All checks run server-side with the service-role client.
 */
export async function createShipment(input: CreateShipmentInput): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isLabRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  const supabase = createAdminClient();

  const { data: job } = await supabase
    .from('lab_jobs')
    .select('id, work_order_id, qc_photos')
    .eq('id', input.jobId)
    .maybeSingle();
  if (!job) return { success: false, error: 'Job not found' };

  const { data: wo } = await supabase
    .from('work_orders')
    .select('order_id, rx_file_id, released_to_lab_at')
    .eq('id', job.work_order_id)
    .single();
  if (!wo) return { success: false, error: 'Work order not found' };

  // --- Compliance gate -------------------------------------------------
  if (!wo.rx_file_id) {
    return { success: false, error: 'Cannot ship: no Rx file on record for this work order' };
  }

  const { data: rxFile } = await supabase
    .from('rx_files')
    .select('id, storage_path, deleted_at')
    .eq('id', wo.rx_file_id)
    .single();
  if (!rxFile || !rxFile.storage_path || rxFile.deleted_at) {
    return { success: false, error: 'Cannot ship: Rx image is missing or has been removed' };
  }

  const { data: reviews } = await supabase
    .from('rx_reviews')
    .select('decision')
    .eq('rx_file_id', wo.rx_file_id)
    .order('reviewed_at', { ascending: false });
  const latestReview = (reviews ?? [])[0];
  if (!latestReview || latestReview.decision !== 'approved') {
    return { success: false, error: 'Cannot ship: Rx has not been approved by an admin' };
  }

  if (!wo.released_to_lab_at) {
    return { success: false, error: 'Cannot ship: work order was never released to the lab' };
  }

  const qcPhotos = (job.qc_photos as unknown as unknown[]) ?? [];
  if (qcPhotos.length === 0) {
    return { success: false, error: 'Cannot ship: QC photos are required before shipment' };
  }

  const { data: order } = await supabase
    .from('orders')
    .select('billing_country')
    .eq('id', wo.order_id)
    .single();
  if (!order || !order.billing_country || !DISPENSABLE_COUNTRIES.includes(order.billing_country.toLowerCase())) {
    return { success: false, error: 'Cannot ship: Rx dispensing is restricted to US/CA in phase 1' };
  }

  // --- All gates passed; create the shipment ---------------------------
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .insert({
      order_id: wo.order_id,
      direction: 'outbound',
      carrier: input.carrier,
      tracking_number: input.trackingNumber,
      tracking_url: input.trackingUrl ?? null,
      status: 'in_transit',
      shipped_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (shipErr || !shipment) return { success: false, error: 'Failed to create shipment' };

  await supabase
    .from('lab_jobs')
    .update({ shipment_id: shipment.id, completed_at: new Date().toISOString() })
    .eq('id', input.jobId);

  await supabase
    .from('orders')
    .update({ fulfillment_status: 'shipped' })
    .eq('id', wo.order_id);

  // Best-effort: reflect the shipment in Shopify so the customer receives
  // Shopify's fulfillment + tracking notification. A Shopify failure must never
  // undo the shipment we've already recorded locally — log and move on.
  if (process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    try {
      const { data: orderRow } = await supabase
        .from('orders')
        .select('shopify_order_id')
        .eq('id', wo.order_id)
        .single();
      const { data: lineItems } = await supabase
        .from('order_line_items')
        .select('shopify_line_item_id')
        .eq('order_id', wo.order_id);
      if (orderRow?.shopify_order_id) {
        const lineItemIds = (lineItems ?? [])
          .map((li) => li.shopify_line_item_id)
          .filter((id): id is number => typeof id === 'number');
        await createFulfillment(orderRow.shopify_order_id, input.trackingNumber, input.carrier, lineItemIds);
      }
    } catch (e) {
      console.error('[create-shipment] Shopify fulfillment push failed (local shipment already recorded)', e);
    }
  }

  return { success: true };
}
