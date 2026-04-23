'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/lib/supabase/types';

type AdminDecision = Database['public']['Enums']['return_admin_decision'];

export interface ReviewReturnInput {
  returnId: string;
  reviewerUserId: string;
  decision: AdminDecision;
  adminNotes: string | null;
  storeCreditAmount?: number | null;
}

export async function reviewReturn(input: ReviewReturnInput): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { data: ret } = await supabase
    .from('returns')
    .select('id, status')
    .eq('id', input.returnId)
    .maybeSingle();

  if (!ret) return { success: false, error: 'Return not found' };
  if (ret.status !== 'pending') return { success: false, error: 'Return is not pending' };

  const newStatus: Database['public']['Enums']['return_status'] =
    input.decision === 'rejected' ? 'rejected' :
    input.decision === 'pending' ? 'pending' : 'in_progress';

  const { error } = await supabase
    .from('returns')
    .update({
      admin_decision: input.decision,
      admin_notes: input.adminNotes,
      store_credit_amount: input.storeCreditAmount ?? null,
      status: newStatus,
      resolved_at: input.decision === 'rejected' ? new Date().toISOString() : null,
    })
    .eq('id', input.returnId);

  if (error) return { success: false, error: 'Failed to save decision' };

  await supabase.from('audit_log').insert({
    user_id: input.reviewerUserId,
    action: 'return_review',
    entity_type: 'returns',
    entity_id: input.returnId,
    after_data: { decision: input.decision, notes: input.adminNotes } as unknown as Json,
  });

  // TODO: when decision === 'approved_refund', call Shopify Admin API refundCreate.
  // Stubbed until Shopify credentials configured.

  return { success: true };
}
