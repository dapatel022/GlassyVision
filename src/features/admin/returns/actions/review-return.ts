'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import type { Database, Json } from '@/lib/supabase/types';
import { createRefund } from '@/lib/commerce/shopify-admin';

type AdminDecision = Database['public']['Enums']['return_admin_decision'];

export interface ReviewReturnInput {
  returnId: string;
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
  // Auth: this action issues real Shopify refunds — it must verify the caller is
  // an admin and derive the reviewer id from the session, never from input.
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

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

  // Atomic claim: flip pending → in_progress in one conditional UPDATE so two
  // overlapping submissions (double-click, retry, second tab) cannot both pass
  // the pending check and each issue a real Shopify refund. The read above is a
  // courtesy fast-path; this is the guard.
  const { data: claimed, error: claimError } = await supabase
    .from('returns')
    .update({ status: 'in_progress' })
    .eq('id', input.returnId)
    .eq('status', 'pending')
    .select('id');
  if (claimError || !claimed || claimed.length === 0) {
    return { success: false, error: 'Return is not pending' };
  }

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
      // Release the claim so the admin can retry once Shopify recovers.
      await supabase.from('returns').update({ status: 'pending' }).eq('id', input.returnId);
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

  if (error) {
    if (shopifyRefundId !== null) {
      // Money already moved on Shopify but the decision failed to persist. Do
      // NOT release the claim — a retry would pass the pending check and issue
      // a SECOND refund. Leave the row in_progress and record the refund id in
      // the audit log so the movement has a durable local record for manual
      // reconciliation.
      const { error: auditErr } = await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'return_decision_persist_failed',
        entity_type: 'returns',
        entity_id: input.returnId,
        after_data: {
          decision: input.decision,
          shopify_refund_id: shopifyRefundId,
          error: error.message,
        } as unknown as Json,
      });
      if (auditErr) {
        console.error('[review-return] persist-failure audit insert also failed', { returnId: input.returnId, shopifyRefundId, error: auditErr });
      }
      return {
        success: false,
        error: `Refund ${shopifyRefundId} was issued on Shopify but saving the decision failed — do NOT retry; reconcile manually (see audit log)`,
      };
    }
    // No money moved — release the claim so the admin can safely retry.
    await supabase.from('returns').update({ status: 'pending' }).eq('id', input.returnId);
    return { success: false, error: 'Failed to save decision' };
  }

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'return_review',
    entity_type: 'returns',
    entity_id: input.returnId,
    after_data: { decision: input.decision, notes: input.adminNotes, shopify_refund_id: shopifyRefundId } as unknown as Json,
  });

  return { success: true };
}
