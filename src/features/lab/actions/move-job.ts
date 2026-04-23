'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

type KanbanColumn = Database['public']['Enums']['kanban_column'];

const QC_REQUIRED_ON_EXIT: KanbanColumn = 'qc';

export async function moveJob(jobId: string, toColumn: KanbanColumn): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { data: job } = await supabase
    .from('lab_jobs')
    .select('id, column, qc_photos, started_at')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) return { success: false, error: 'Job not found' };

  if (job.column === QC_REQUIRED_ON_EXIT && toColumn !== QC_REQUIRED_ON_EXIT) {
    const photos = (job.qc_photos as unknown as unknown[]) ?? [];
    if (photos.length === 0) {
      return { success: false, error: 'QC photos required before leaving QC column' };
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
