'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/lib/supabase/types';

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

function buildWorkOrderNumber(sequence: number): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `WO-${yyyymm}-${String(sequence).padStart(3, '0')}`;
}

export async function generateWorkOrder(rxFileId: string): Promise<GenerateWorkOrderResult> {
  const supabase = createAdminClient();

  const { data: rxFile, error: fetchError } = await supabase
    .from('rx_files')
    .select(`
      id, order_id, line_item_id,
      typed_od_sphere, typed_od_cylinder, typed_od_axis, typed_od_add,
      typed_os_sphere, typed_os_cylinder, typed_os_axis, typed_os_add,
      typed_pd, typed_pd_type,
      rx_reviews (decision),
      order_line_items!inner (id, sku, product_title, frame_shape, frame_color, frame_size)
    `)
    .eq('id', rxFileId)
    .single();

  if (fetchError || !rxFile) {
    return { success: false, error: 'Rx file not found' };
  }

  const reviews = (rxFile as unknown as { rx_reviews: Array<{ decision: string }> }).rx_reviews ?? [];
  const latest = reviews[reviews.length - 1];
  if (!latest || latest.decision !== 'approved') {
    return { success: false, error: 'Rx is not approved' };
  }

  if (!rxFile.line_item_id) {
    return { success: false, error: 'Rx file missing line_item_id' };
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

  return { success: true, workOrderId: inserted.id, workOrderNumber: inserted.work_order_number };
}
