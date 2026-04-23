'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/lib/supabase/types';

type RxDecision = Database['public']['Enums']['rx_decision'];
type RxRejectionReason = Database['public']['Enums']['rx_rejection_reason'];
type RxStatus = Database['public']['Enums']['rx_status'];

export interface ReviewRxInput {
  rxFileId: string;
  reviewerUserId: string;
  decision: RxDecision;
  decisionReason: RxRejectionReason;
  notes: string | null;
}

export interface ReviewRxResult {
  success: boolean;
  error?: string;
}

export async function reviewRx(input: ReviewRxInput): Promise<ReviewRxResult> {
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
      reviewer_user_id: input.reviewerUserId,
      decision: input.decision,
      decision_reason: input.decisionReason,
      notes: input.notes,
    })
    .select('id')
    .single();

  if (reviewError) {
    return { success: false, error: 'Failed to save review' };
  }

  await supabase.from('audit_log').insert({
    user_id: input.reviewerUserId,
    action: 'rx_review',
    entity_type: 'rx_files',
    entity_id: input.rxFileId,
    after_data: {
      decision: input.decision,
      decision_reason: input.decisionReason,
      notes: input.notes,
    } as unknown as Json,
  });

  const newStatus: RxStatus = input.decision === 'approved' ? 'approved' : 'rejected';
  await supabase
    .from('orders')
    .update({ rx_status: newStatus })
    .eq('id', rxFile.order_id);

  if (input.decision === 'rejected') {
    await supabase
      .from('rx_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', input.rxFileId);
  }

  return { success: true };
}
