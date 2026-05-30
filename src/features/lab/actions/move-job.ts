'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isLabRole } from '@/lib/auth/middleware';
import type { Database } from '@/lib/supabase/types';

type KanbanColumn = Database['public']['Enums']['kanban_column'];

const QC_REQUIRED_ON_EXIT: KanbanColumn = 'qc';
const SHIP_COLUMN: KanbanColumn = 'ship';

export async function moveJob(jobId: string, toColumn: KanbanColumn): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isLabRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  const supabase = createAdminClient();

  const { data: job } = await supabase
    .from('lab_jobs')
    .select('id, work_order_id, column, qc_photos, started_at')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) return { success: false, error: 'Job not found' };

  const photos = (job.qc_photos as unknown as unknown[]) ?? [];

  if (job.column === QC_REQUIRED_ON_EXIT && toColumn !== QC_REQUIRED_ON_EXIT) {
    if (photos.length === 0) {
      return { success: false, error: 'QC photos required before leaving QC column' };
    }
  }

  // A job may only enter the ship column once the work order is released to
  // the lab and QC photos exist — preventing a jump straight from inbox to
  // ship that would bypass the release + QC compliance steps.
  if (toColumn === SHIP_COLUMN) {
    const { data: wo } = await supabase
      .from('work_orders')
      .select('released_to_lab_at')
      .eq('id', job.work_order_id)
      .single();
    if (!wo || !wo.released_to_lab_at) {
      return { success: false, error: 'Cannot move to ship: work order not released to lab' };
    }
    if (photos.length === 0) {
      return { success: false, error: 'Cannot move to ship: QC photos required' };
    }
  }

  const patch: Database['public']['Tables']['lab_jobs']['Update'] = { column: toColumn };
  if (!job.started_at && toColumn !== 'inbox') {
    patch.started_at = new Date().toISOString();
  }

  const { error } = await supabase.from('lab_jobs').update(patch).eq('id', jobId);
  if (error) return { success: false, error: 'Failed to move job' };

  return { success: true };
}
