'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import type { Database, Json } from '@/lib/supabase/types';
import { generateWorkOrder } from '@/features/admin/actions/generate-work-order';

type RxDecision = Database['public']['Enums']['rx_decision'];
type RxRejectionReason = Database['public']['Enums']['rx_rejection_reason'];
type RxStatus = Database['public']['Enums']['rx_status'];

export interface ReviewRxInput {
  rxFileId: string;
  decision: RxDecision;
  decisionReason: RxRejectionReason;
  notes: string | null;
}

export interface ReviewRxResult {
  success: boolean;
  error?: string;
}

export async function reviewRx(input: ReviewRxInput): Promise<ReviewRxResult> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }
  const reviewerUserId = user.id;

  const supabase = createAdminClient();

  const { data: rxFile, error: fetchError } = await supabase
    .from('rx_files')
    .select('id, order_id')
    .eq('id', input.rxFileId)
    .single();

  if (fetchError || !rxFile) {
    return { success: false, error: 'Rx file not found' };
  }

  const { error: reviewError } = await supabase
    .from('rx_reviews')
    .insert({
      rx_file_id: input.rxFileId,
      reviewer_user_id: reviewerUserId,
      decision: input.decision,
      decision_reason: input.decisionReason,
      notes: input.notes,
    })
    .select('id')
    .single();

  if (reviewError) {
    return { success: false, error: 'Failed to save review' };
  }

  const { error: auditError } = await supabase.from('audit_log').insert({
    user_id: reviewerUserId,
    action: 'rx_review',
    entity_type: 'rx_files',
    entity_id: input.rxFileId,
    after_data: {
      decision: input.decision,
      decision_reason: input.decisionReason,
      notes: input.notes,
    } as unknown as Json,
  });
  if (auditError) {
    // Compliance audit trail must not silently disappear. Log loudly so
    // operators see it, but don't block the review (the rx_reviews row
    // already exists — that's the primary record).
    console.error('[review-rx] audit_log insert failed', { rxFileId: input.rxFileId, error: auditError });
  }

  const newStatus: RxStatus = input.decision === 'approved' ? 'approved' : 'rejected';
  const { error: updateError } = await supabase
    .from('orders')
    .update({ rx_status: newStatus })
    .eq('id', rxFile.order_id);
  if (updateError) {
    console.error('[review-rx] orders.rx_status update failed', { orderId: rxFile.order_id, error: updateError });
    return { success: false, error: 'Review saved but order status update failed — please retry or contact support' };
  }

  if (input.decision === 'rejected') {
    const { error: deleteError } = await supabase
      .from('rx_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', input.rxFileId);
    if (deleteError) {
      console.error('[review-rx] rx_files soft-delete failed', { rxFileId: input.rxFileId, error: deleteError });
    }
  }

  if (input.decision === 'approved') {
    const genResult = await generateWorkOrder(input.rxFileId);
    if (!genResult.success) {
      console.error('[review-rx] work order generation failed', { rxFileId: input.rxFileId, error: genResult.error });
      const { error: failureAuditError } = await supabase.from('audit_log').insert({
        user_id: reviewerUserId,
        action: 'work_order_generation_failed',
        entity_type: 'rx_files',
        entity_id: input.rxFileId,
        after_data: { error: genResult.error } as unknown as Json,
      });
      if (failureAuditError) {
        console.error('[review-rx] failure-audit insert failed', failureAuditError);
      }
    }
  }

  return { success: true };
}
