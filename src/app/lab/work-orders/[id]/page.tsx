import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isLabRole } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import LabWorkOrderDetail from '@/features/lab/components/LabWorkOrderDetail';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LabWorkOrderDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/lab');

  if (!isLabRole(user.role)) {
    redirect('/unauthorized');
  }

  const { id } = await params;
  const supabase = createAdminClient();

  // Query work order
  const { data: workOrder } = await supabase
    .from('work_orders')
    .select(`
      id, work_order_number, frame_sku, frame_shape, frame_color, frame_size,
      lens_type, lens_material, tint, monocular_pd_od, monocular_pd_os,
      released_to_lab_at, order_id, rx_file_id
    `)
    .eq('id', id)
    .maybeSingle();

  if (!workOrder) notFound();

  // Query order details
  const { data: order } = await supabase
    .from('orders')
    .select('shopify_order_number, customer_email, customer_name')
    .eq('id', workOrder.order_id)
    .single();

  // Query active lab job
  const { data: job } = await supabase
    .from('lab_jobs')
    .select('id, column, qc_photos')
    .eq('work_order_id', id)
    .maybeSingle();

  if (!job) {
    return (
      <div className="min-h-screen bg-base p-6 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">No active lab job</h1>
          <p className="text-muted text-sm font-serif italic">This work order has not been released to the lab workbench, or has already been fulfilled.</p>
          <a href="/lab" className="inline-block text-xs font-mono text-accent hover:underline uppercase font-bold">← Back to Workbench</a>
        </div>
      </div>
    );
  }

  // Get prescription files if exists
  let rxImageUrl = '';
  let rxValues = {
    typed_od_sphere: null as string | null,
    typed_od_cylinder: null as string | null,
    typed_od_axis: null as string | null,
    typed_os_sphere: null as string | null,
    typed_os_cylinder: null as string | null,
    typed_os_axis: null as string | null,
    typed_pd: null as string | null,
  };

  if (workOrder.rx_file_id) {
    const { data: rx } = await supabase
      .from('rx_files')
      .select('typed_od_sphere, typed_od_cylinder, typed_od_axis, typed_os_sphere, typed_os_cylinder, typed_os_axis, typed_pd, storage_path')
      .eq('id', workOrder.rx_file_id)
      .single();
    if (rx) {
      rxValues = rx;
      const { data: urlData } = await supabase.storage.from('rx-files').createSignedUrl(rx.storage_path, 3600);
      rxImageUrl = urlData?.signedUrl ?? '';
    }
  }

  // Convert qc photo storage paths to signed preview URLs
  const qcPhotos = (job.qc_photos as unknown as string[]) ?? [];
  const qcPreviewUrls = await Promise.all(
    qcPhotos.map(async (path) => {
      const { data: urlData } = await supabase.storage.from('qc-photos').createSignedUrl(path, 3600);
      return urlData?.signedUrl || '';
    })
  );

  return (
    <div className="min-h-screen bg-base p-6">
      <LabWorkOrderDetail
        workOrder={workOrder}
        order={order ?? { shopify_order_number: '—', customer_email: '—', customer_name: '—' }}
        rx={{ ...rxValues, rxImageUrl }}
        jobId={job.id}
        initialColumn={job.column}
        qcPhotos={qcPreviewUrls.filter(Boolean)}
      />
    </div>
  );
}
