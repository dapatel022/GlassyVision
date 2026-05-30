'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';

export async function releaseWorkOrder(workOrderId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  const supabase = createAdminClient();

  // Releasing authorizes the lab to begin physical work (lenses cut, materials
  // consumed). Re-validate the Rx at this moment — approval can predate a
  // later soft-delete or rejection — so the lab never starts on an invalid Rx.
  const { data: wo } = await supabase
    .from('work_orders')
    .select('rx_file_id')
    .eq('id', workOrderId)
    .single();
  if (!wo) return { success: false, error: 'Work order not found' };
  if (!wo.rx_file_id) {
    return { success: false, error: 'Cannot release: no Rx file on record for this work order' };
  }

  const { data: rxFile } = await supabase
    .from('rx_files')
    .select('storage_path, deleted_at')
    .eq('id', wo.rx_file_id)
    .single();
  if (!rxFile || !rxFile.storage_path || rxFile.deleted_at) {
    return { success: false, error: 'Cannot release: Rx image is missing or has been removed' };
  }

  const { data: reviews } = await supabase
    .from('rx_reviews')
    .select('decision')
    .eq('rx_file_id', wo.rx_file_id)
    .order('reviewed_at', { ascending: false });
  const latestReview = (reviews ?? [])[0];
  if (!latestReview || latestReview.decision !== 'approved') {
    return { success: false, error: 'Cannot release: Rx has not been approved by an admin' };
  }

  const { error: woError } = await supabase
    .from('work_orders')
    .update({ released_to_lab_at: new Date().toISOString() })
    .eq('id', workOrderId);

  if (woError) return { success: false, error: 'Failed to release work order' };

  await supabase
    .from('lab_jobs')
    .update({ column: 'ready_to_cut' })
    .eq('work_order_id', workOrderId);

  return { success: true };
}
