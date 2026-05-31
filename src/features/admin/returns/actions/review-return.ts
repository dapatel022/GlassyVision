'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/lib/supabase/types';
import { createRefund } from '@/lib/commerce/shopify-admin';

type AdminDecision = Database['public']['Enums']['return_admin_decision'];

export interface ReviewReturnInput {
  returnId: string;
  reviewerUserId: string;
  decision: AdminDecision;
  adminNotes: string | null;
  storeCreditAmount?: number | null;
}

interface ShopifyRefundResponse {
  refund?: {
    id: number;
  };
}

export async function reviewReturn(input: ReviewReturnInput): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  // Retrieve returns request with order and line item details
  const { data: ret } = await supabase
    .from('returns')
    .select(`
      id, status, order_id, line_item_id, preferred_resolution,
      orders (shopify_order_id, currency, total),
      order_line_items (line_total)
    `)
    .eq('id', input.returnId)
    .maybeSingle();

  if (!ret) return { success: false, error: 'Return not found' };
  if (ret.status !== 'pending') return { success: false, error: 'Return is not pending' };

  const orders = ret.orders as unknown as { shopify_order_id: number; currency: string; total: number } | null;
  const lineItem = ret.order_line_items as unknown as { line_total: number } | null;

  if (!orders) return { success: false, error: 'Linked order not found' };

  // If approved for refund, invoke the Shopify Admin API
  let shopifyRefundId: number | null = null;
  if (input.decision === 'approved_refund') {
    const refundAmount = Number(input.storeCreditAmount ?? lineItem?.line_total ?? orders.total);

    try {
      const refundResult = await createRefund(
        orders.shopify_order_id,
        refundAmount,
        orders.currency || 'USD',
        input.adminNotes || 'Refund via GlassyVision Admin Panel'
      ) as ShopifyRefundResponse;

      shopifyRefundId = refundResult?.refund?.id || null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: `Failed to create refund on Shopify: ${msg}` };
    }
  }

  const newStatus: Database['public']['Enums']['return_status'] =
    input.decision === 'rejected' ? 'rejected' :
    input.decision === 'pending' ? 'pending' : 'completed'; // Mark completed on resolution

  const { error } = await supabase
    .from('returns')
    .update({
      admin_decision: input.decision,
      admin_notes: input.adminNotes,
      store_credit_amount: input.storeCreditAmount ?? null,
      shopify_refund_id: shopifyRefundId,
      status: newStatus,
      resolved_at: input.decision !== 'pending' ? new Date().toISOString() : null,
    })
    .eq('id', input.returnId);

  if (error) return { success: false, error: 'Failed to save decision' };

  await supabase.from('audit_log').insert({
    user_id: input.reviewerUserId,
    action: 'return_review',
    entity_type: 'returns',
    entity_id: input.returnId,
    after_data: { decision: input.decision, notes: input.adminNotes, shopify_refund_id: shopifyRefundId } as unknown as Json,
  });

  return { success: true };
}
