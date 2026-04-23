import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/middleware';
import { redirect } from 'next/navigation';
import RxQueueClient from './client';

export const dynamic = 'force-dynamic';

export default async function RxQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/rx-queue');

  const supabase = createAdminClient();

  const { data: pendingFiles } = await supabase
    .from('rx_files')
    .select(`
      id,
      order_id,
      storage_path,
      mime_type,
      uploaded_at,
      customer_email,
      typed_od_sphere,
      typed_od_cylinder,
      typed_od_axis,
      typed_os_sphere,
      typed_os_cylinder,
      typed_os_axis,
      typed_pd,
      auto_check_results,
      certification_checked,
      rx_expiration_date
    `)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: true });

  const fileIds = (pendingFiles || []).map((f) => f.id);
  const { data: existingReviews } = await supabase
    .from('rx_reviews')
    .select('rx_file_id')
    .in('rx_file_id', fileIds.length > 0 ? fileIds : ['00000000-0000-0000-0000-000000000000']);

  const reviewedIds = new Set((existingReviews || []).map((r) => r.rx_file_id));
  const unreviewed = (pendingFiles || []).filter((f) => !reviewedIds.has(f.id));

  const orderIds = [...new Set(unreviewed.map((f) => f.order_id))];
  const { data: orders } = await supabase
    .from('orders')
    .select('id, shopify_order_number')
    .in('id', orderIds.length > 0 ? orderIds : ['00000000-0000-0000-0000-000000000000']);

  const orderMap = new Map((orders || []).map((o) => [o.id, o.shopify_order_number]));

  const items = await Promise.all(
    unreviewed.map(async (f) => {
      const { data: urlData } = await supabase.storage
        .from('rx-files')
        .createSignedUrl(f.storage_path, 3600);

      return {
        id: f.id,
        orderNumber: orderMap.get(f.order_id) || 'Unknown',
        customerEmail: f.customer_email,
        storagePath: f.storage_path,
        imageUrl: urlData?.signedUrl || '',
        mimeType: f.mime_type,
        uploadedAt: f.uploaded_at,
        typedValues: {
          odSphere: f.typed_od_sphere,
          odCylinder: f.typed_od_cylinder,
          odAxis: f.typed_od_axis,
          osSphere: f.typed_os_sphere,
          osCylinder: f.typed_os_cylinder,
          osAxis: f.typed_os_axis,
          pd: f.typed_pd,
        },
        autoCheckResults: f.auto_check_results as Record<string, unknown> | null,
        certificationChecked: f.certification_checked,
        expirationDate: f.rx_expiration_date,
        hasWarnings: !!(f.auto_check_results as { warnings?: unknown[] } | null)?.warnings?.length,
      };
    }),
  );

  return <RxQueueClient items={items} reviewerUserId={user.id} />;
}
