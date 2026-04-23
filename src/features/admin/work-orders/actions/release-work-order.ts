'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export async function releaseWorkOrder(workOrderId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

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
