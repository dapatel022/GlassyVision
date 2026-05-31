'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isLabRole } from '@/lib/auth/middleware';
import { createFulfillment } from '@/lib/commerce/shopify-admin';
import { isRxExpired } from '@/lib/rx/expiration';
import { isDispensableDestination } from '@/lib/rx/market';
import { advanceRedemptionForOrder } from '@/features/subscriptions/advance-redemption';

export interface CreateShipmentInput {
  jobId: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
}

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
    .select('order_id, line_item_id, rx_file_id, released_to_lab_at')
    .eq('id', job.work_order_id)
    .single();
  if (!wo) return { success: false, error: 'Work order not found' };

  // --- Compliance gate -------------------------------------------------
  if (!wo.rx_file_id) {
    return { success: false, error: 'Cannot ship: no Rx file on record for this work order' };
  }

  const { data: rxFile } = await supabase
    .from('rx_files')
    .select('id, storage_path, deleted_at, rx_expiration_date')
    .eq('id', wo.rx_file_id)
    .single();
  if (!rxFile || !rxFile.storage_path || rxFile.deleted_at) {
    return { success: false, error: 'Cannot ship: Rx image is missing or has been removed' };
  }

  // FTC Eyeglass Rule: a valid, UNEXPIRED Rx must be on file at dispense.
  // Expiration is also checked at intake, but a prescription can lapse in the
  // weeks/months between upload and shipment (acute for subscription pairs
  // redeemed late in the term) — re-check here so a stale Rx never ships.
  if (isRxExpired(rxFile.rx_expiration_date)) {
    return { success: false, error: 'Cannot ship: the prescription on file has expired' };
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
    .select('billing_country, shipping_address')
    .eq('id', wo.order_id)
    .single();
  // Gate on the actual SHIP-TO destination, not billing country: a US-billed
  // customer can ship a pair to a non-dispensable country (e.g. the UK, where
  // Rx dispensing requires an optician we don't yet have).
  if (!order || !isDispensableDestination(order.shipping_address as { country_code?: string } | null, order.billing_country)) {
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

  // Mirror onto a linked subscription redemption and anchor 3-year Rx retention
  // at the ship date. No-op for normal Shopify orders (no redemption links them).
  // Runs after the local shipment + order update succeed — never gates shipment.
  await advanceRedemptionForOrder(wo.order_id, 'shipped', supabase, {
    retentionAnchor: new Date().toISOString().slice(0, 10),
  });

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
      // Scope the fulfillment to THIS work order's line item only — a
      // multi-item order ships one work order at a time, so fulfilling every
      // line item would wrongly mark the whole order shipped.
      const { data: lineItem } = await supabase
        .from('order_line_items')
        .select('shopify_line_item_id')
        .eq('id', wo.line_item_id)
        .maybeSingle();
      if (orderRow?.shopify_order_id && typeof lineItem?.shopify_line_item_id === 'number') {
        await createFulfillment(orderRow.shopify_order_id, input.trackingNumber, input.carrier, [lineItem.shopify_line_item_id]);
      }
    } catch (e) {
      console.error('[create-shipment] Shopify fulfillment push failed (local shipment already recorded)', e);
    }
  }

  return { success: true };
}
