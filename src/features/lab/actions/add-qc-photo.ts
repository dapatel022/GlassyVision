'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/types';

export async function addQcPhoto(jobId: string, storagePath: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { data: job } = await supabase
    .from('lab_jobs')
    .select('qc_photos')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) return { success: false, error: 'Job not found' };

  const existing = (job.qc_photos as unknown as string[]) ?? [];
  const next = [...existing, storagePath];

  const { error } = await supabase
    .from('lab_jobs')
    .update({ qc_photos: next as unknown as Json })
    .eq('id', jobId);

  if (error) return { success: false, error: 'Failed to save photo' };

  return { success: true };
}
