import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import WorkOrderDetail from '@/features/admin/work-orders/components/WorkOrderDetail';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkOrderDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/work-orders');

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: workOrder } = await supabase
    .from('work_orders')
    .select(`
      id, work_order_number, frame_sku, frame_shape, frame_color, frame_size,
      lens_type, lens_material, tint, monocular_pd_od, monocular_pd_os,
      released_to_lab_at, pdf_storage_path,
      order_id, rx_file_id
    `)
    .eq('id', id)
    .maybeSingle();

  if (!workOrder) notFound();

  const { data: order } = await supabase
    .from('orders')
    .select('shopify_order_number, customer_email, customer_name')
    .eq('id', workOrder.order_id)
    .single();

  let rxImageUrl = '';
  let rxValues = {
    typed_od_sphere: null as string | null,
    typed_od_cylinder: null as string | null,
    typed_od_axis: null as string | null,
    typed_os_sphere: null as string | null,
    typed_os_cylinder: null as string | null,
    typed_os_axis: null as string | null,
    typed_pd: null as string | null,
    rx_expiration_date: null as string | null,
    storage_path: '',
  };

  if (workOrder.rx_file_id) {
    const { data: rx } = await supabase
      .from('rx_files')
      .select('typed_od_sphere, typed_od_cylinder, typed_od_axis, typed_os_sphere, typed_os_cylinder, typed_os_axis, typed_pd, rx_expiration_date, storage_path')
      .eq('id', workOrder.rx_file_id)
      .single();
    if (rx) {
      rxValues = rx;
      const { data: urlData } = await supabase.storage.from('rx-files').createSignedUrl(rx.storage_path, 3600);
      rxImageUrl = urlData?.signedUrl ?? '';
    }
  }

  return (
    <div className="min-h-screen bg-base p-6">
      <WorkOrderDetail
        workOrder={workOrder}
        order={order ?? { shopify_order_number: '—', customer_email: '—', customer_name: '—' }}
        rx={{ ...rxValues, rxImageUrl }}
      />
    </div>
  );
}
