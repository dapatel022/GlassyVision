import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateWorkOrderPdf } from '@/features/admin/work-orders/lib/pdf-generator';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: wo } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 });

  const { data: order } = await supabase
    .from('orders')
    .select('shopify_order_number, customer_name')
    .eq('id', wo.order_id)
    .single();

  const { data: rx } = wo.rx_file_id
    ? await supabase
        .from('rx_files')
        .select('typed_od_sphere, typed_od_cylinder, typed_od_axis, typed_os_sphere, typed_os_cylinder, typed_os_axis')
        .eq('id', wo.rx_file_id)
        .single()
    : { data: null };

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://glassyvision.com';
  const pdfBytes = await generateWorkOrderPdf({
    workOrderNumber: wo.work_order_number,
    detailUrl: `${baseUrl}/admin/work-orders/${wo.id}`,
    frameSku: wo.frame_sku,
    frameShape: wo.frame_shape,
    frameColor: wo.frame_color,
    frameSize: wo.frame_size,
    lensType: wo.lens_type,
    lensMaterial: wo.lens_material,
    tint: wo.tint,
    monocularPdOd: wo.monocular_pd_od,
    monocularPdOs: wo.monocular_pd_os,
    rx: {
      od: { sphere: rx?.typed_od_sphere ?? null, cylinder: rx?.typed_od_cylinder ?? null, axis: rx?.typed_od_axis ?? null },
      os: { sphere: rx?.typed_os_sphere ?? null, cylinder: rx?.typed_os_cylinder ?? null, axis: rx?.typed_os_axis ?? null },
    },
    specialInstructions: wo.special_instructions,
    orderNumber: order?.shopify_order_number ?? '—',
    customerName: order?.customer_name ?? '—',
  });

  const bytes = new Uint8Array(pdfBytes);
  await supabase.storage
    .from('work-orders')
    .upload(`${wo.id}.pdf`, bytes, { contentType: 'application/pdf', upsert: true })
    .catch(() => null);

  await supabase
    .from('work_orders')
    .update({ pdf_storage_path: `${wo.id}.pdf` })
    .eq('id', wo.id);

  return new NextResponse(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${wo.work_order_number}.pdf"`,
    },
  });
}
