'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import type { Database, Json } from '@/lib/supabase/types';
import { isRxExpired } from '@/lib/rx/expiration';
import { isDispensableDestination } from '@/lib/rx/market';
import { advanceRedemptionForOrder } from '@/features/subscriptions/advance-redemption';
import { buildWorkOrderNumber } from '@/features/admin/lib/work-order-number';

type LensType = Database['public']['Enums']['lens_type'];
type LensMaterial = Database['public']['Enums']['lens_material'];

export type GenerateWorkOrderResult =
  | { success: true; workOrderId: string; workOrderNumber: string }
  | { success: false; error: string };

function splitPd(pdString: string | null, pdType: string | null): { od: number | null; os: number | null } {
  if (!pdString) return { od: null, os: null };
  const pd = Number(pdString);
  if (isNaN(pd)) return { od: null, os: null };
  if (pdType === 'mono') return { od: pd, os: pd };
  const half = pd / 2;
  return { od: half, os: half };
}

export async function generateWorkOrder(rxFileId: string): Promise<GenerateWorkOrderResult> {
  // Auth: callable directly as a server action, so it re-verifies the admin role
  // even though its only in-app caller (reviewRx) is already gated.
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  const supabase = createAdminClient();

  const { data: rxFile, error: fetchError } = await supabase
    .from('rx_files')
    .select(`
      id, order_id, line_item_id, storage_path, deleted_at, rx_expiration_date,
      typed_od_sphere, typed_od_cylinder, typed_od_axis, typed_od_add,
      typed_os_sphere, typed_os_cylinder, typed_os_axis, typed_os_add,
      typed_od_prism, typed_od_base, typed_os_prism, typed_os_base,
      typed_pd, typed_pd_type,
      rx_reviews (decision, reviewed_at),
      order_line_items!inner (id, sku, product_title, frame_shape, frame_color, frame_size)
    `)
    .eq('id', rxFileId)
    .single();

  if (fetchError || !rxFile) {
    return { success: false, error: 'Rx file not found' };
  }

  // Pick the most recent review by reviewed_at — PostgREST does not guarantee
  // embedded-relation ordering, so we must not rely on array position.
  const reviews = (rxFile as unknown as { rx_reviews: Array<{ decision: string; reviewed_at: string }> }).rx_reviews ?? [];
  const latest = [...reviews].sort((a, b) => (a.reviewed_at < b.reviewed_at ? 1 : -1))[0];
  if (!latest || latest.decision !== 'approved') {
    return { success: false, error: 'Rx is not approved' };
  }

  // Compliance rule 2: typed values are double-check input only — a real,
  // non-deleted Rx image must exist before any specs reach the lab. Guards
  // against a typed-only prescription ever producing a work order.
  if (!rxFile.storage_path || rxFile.deleted_at) {
    return { success: false, error: 'Cannot generate work order: Rx image file is missing' };
  }

  // FTC Eyeglass Rule: never cut lenses against an expired prescription. The
  // shipment gate re-checks this too, but blocking here avoids wasting lab work.
  if (isRxExpired(rxFile.rx_expiration_date)) {
    return { success: false, error: 'Cannot generate work order: the prescription has expired' };
  }

  // Rule 6: never start lab work for a non-dispensable destination (e.g. UK Rx).
  // The shipment gate re-checks this, but blocking here avoids wasted lab effort.
  const { data: order } = await supabase
    .from('orders')
    .select('billing_country, shipping_address')
    .eq('id', rxFile.order_id)
    .single();
  if (!order || !isDispensableDestination(order.shipping_address as { country_code?: string } | null, order.billing_country)) {
    return { success: false, error: 'Cannot generate work order: Rx dispensing is restricted to US/CA in phase 1' };
  }

  if (!rxFile.line_item_id) {
    return { success: false, error: 'Rx file missing line_item_id' };
  }

  // Idempotency: a work order is generated once per approved Rx file. There is no
  // DB UNIQUE on work_orders.rx_file_id, so guard here — a repeated approval/call
  // must not spawn duplicate work orders + lab jobs.
  const { data: existingWo } = await supabase
    .from('work_orders')
    .select('id, work_order_number')
    .eq('rx_file_id', rxFile.id)
    .maybeSingle();
  if (existingWo) {
    return { success: true, workOrderId: existingWo.id, workOrderNumber: existingWo.work_order_number };
  }

  const lineItem = (rxFile as unknown as {
    order_line_items: { id: string; sku: string | null; product_title: string; frame_shape: string | null; frame_color: string | null; frame_size: string | null };
  }).order_line_items;

  const { count } = await supabase
    .from('work_orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  const workOrderNumber = buildWorkOrderNumber((count ?? 0) + 1);
  const { od: pdOd, os: pdOs } = splitPd(rxFile.typed_pd, rxFile.typed_pd_type);

  const lensType: LensType = 'single_vision';
  const lensMaterial: LensMaterial = 'cr39';

  const { data: inserted, error: insertError } = await supabase
    .from('work_orders')
    .insert({
      order_id: rxFile.order_id,
      line_item_id: rxFile.line_item_id,
      rx_file_id: rxFile.id,
      work_order_number: workOrderNumber,
      frame_sku: lineItem.sku ?? 'UNKNOWN',
      frame_shape: lineItem.frame_shape,
      frame_color: lineItem.frame_color,
      frame_size: lineItem.frame_size,
      lens_type: lensType,
      lens_material: lensMaterial,
      coatings: [] as unknown as Json,
      tint: 'none',
      monocular_pd_od: pdOd,
      monocular_pd_os: pdOs,
      axis_double_entered: !!(rxFile.typed_od_axis || rxFile.typed_os_axis),
    })
    .select('id, work_order_number')
    .single();

  if (insertError || !inserted) {
    return { success: false, error: 'Failed to create work order' };
  }

  const { error: jobError } = await supabase
    .from('lab_jobs')
    .insert({
      work_order_id: inserted.id,
      column: 'inbox',
      priority: 5,
    });

  if (jobError) {
    return { success: false, error: 'Work order created but lab job failed' };
  }

  const { error: auditError } = await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'work_order_generated',
    entity_type: 'work_orders',
    entity_id: inserted.id,
    after_data: {
      work_order_number: inserted.work_order_number,
      rx_file_id: rxFile.id,
      typed_od_prism: rxFile.typed_od_prism,
      typed_od_base: rxFile.typed_od_base,
      typed_os_prism: rxFile.typed_os_prism,
      typed_os_base: rxFile.typed_os_base,
    } as unknown as Json,
  });
  if (auditError) {
    console.error('[generate-work-order] audit_log insert failed', { workOrderId: inserted.id, error: auditError });
  }

  // Mirror status onto a linked subscription redemption (no-op for normal
  // Shopify orders, which never match a redemption's internal_order_id). Called
  // after the work order + lab job succeed so it can never block fulfillment.
  await advanceRedemptionForOrder(rxFile.order_id, 'in_production', supabase, {
    workOrderId: inserted.id,
  });

  return { success: true, workOrderId: inserted.id, workOrderNumber: inserted.work_order_number };
}
