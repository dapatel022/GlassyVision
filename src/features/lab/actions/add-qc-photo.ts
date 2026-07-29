'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isLabRole } from '@/lib/auth/middleware';
import type { Json } from '@/lib/supabase/types';

export async function addQcPhoto(jobId: string, storagePath: string): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isLabRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  // Bind the photo to this job: the qc-upload-url route mints paths as
  // `${jobId}/<uuid>.<ext>`, so a path not under this job's prefix is either a
  // cross-job attach or a fabricated string. Without this the QC compliance gate
  // (qc_photos.length > 0 in moveJob/createShipment) was satisfiable with any
  // string, e.g. addQcPhoto(jobId, 'fake').
  if (!storagePath.startsWith(`${jobId}/`)) {
    return { success: false, error: 'Invalid QC photo reference' };
  }

  const supabase = createAdminClient();

  const { data: job } = await supabase
    .from('lab_jobs')
    .select('column, qc_photos')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) return { success: false, error: 'Job not found' };

  // QC photos document the finished pair at inspection time. Attaching one
  // earlier would satisfy the QC shipment gate without the job ever reaching
  // QC, so bind the upload to the QC stage.
  if (job.column !== 'qc') {
    return { success: false, error: 'QC photos can only be added while the job is in the QC stage' };
  }

  const existing = (job.qc_photos as unknown as string[]) ?? [];
  if (existing.includes(storagePath)) return { success: true }; // idempotent
  const next = [...existing, storagePath];

  const { error } = await supabase
    .from('lab_jobs')
    .update({ qc_photos: next as unknown as Json })
    .eq('id', jobId);

  if (error) return { success: false, error: 'Failed to save photo' };

  return { success: true };
}
