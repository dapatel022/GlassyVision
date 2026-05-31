import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type RedemptionStatus = Database['public']['Enums']['redemption_status'];

interface AdvanceOpts {
  workOrderId?: string;
  retentionAnchor?: string; // date (YYYY-MM-DD)
}

/**
 * Mirror a fulfillment-pipeline status change onto the subscription redemption
 * linked to the given internal (synthesized) order.
 *
 * SAFETY — this is called from the SHARED pipeline (generate-work-order,
 * create-shipment), which also handles normal Shopify orders. It MUST be a safe
 * no-op for those: the UPDATE is scoped to rows where `internal_order_id` equals
 * the order id, so a normal order (never the `internal_order_id` of any
 * redemption) matches zero rows and nothing changes. Callers invoke it only
 * AFTER their own success paths, so it can never interfere with a compliance
 * gate.
 */
export async function advanceRedemptionForOrder(
  internalOrderId: string,
  toStatus: RedemptionStatus,
  supabase: SupabaseClient,
  opts: AdvanceOpts = {},
): Promise<{ advanced: boolean }> {
  const patch: Record<string, unknown> = { status: toStatus };
  if (opts.workOrderId) patch.work_order_id = opts.workOrderId;
  if (opts.retentionAnchor) patch.retention_anchor = opts.retentionAnchor;

  const { data } = await supabase
    .from('subscription_redemptions')
    .update(patch)
    .eq('internal_order_id', internalOrderId)
    .select('id');

  return { advanced: (data?.length ?? 0) > 0 };
}
