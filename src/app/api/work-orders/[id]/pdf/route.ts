import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole, isLabRole } from '@/lib/auth/middleware';
import { generateWorkOrderPdf } from '@/features/admin/work-orders/lib/pdf-generator';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // The work-order PDF contains prescription values (PII). Staff only — never
  // expose it to an unauthenticated or zero-access caller who guesses the UUID.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(user.role) && !isLabRole(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: wo } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 });

  // A lab-only user may only fetch work orders that have been released to the lab.
  // Admins (founder/reviewer) may fetch any. A founder is both, so admin wins.
  if (!isAdminRole(user.role) && isLabRole(user.role) && !wo.released_to_lab_at) {
    return NextResponse.json({ error: 'Work order not yet released to the lab' }, { status: 403 });
  }

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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://glassyvision.com';
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
  // Archive to the bucket the migration actually created ('work-order-pdfs', not
  // 'work-orders'), and only record pdf_storage_path if the upload succeeded —
  // otherwise the column pointed at a file that was never stored.
  const { error: uploadErr } = await supabase.storage
    .from('work-order-pdfs')
    .upload(`${wo.id}.pdf`, bytes, { contentType: 'application/pdf', upsert: true });

  if (!uploadErr) {
    await supabase
      .from('work_orders')
      .update({ pdf_storage_path: `${wo.id}.pdf` })
      .eq('id', wo.id);
  } else {
    console.error('[work-order-pdf] archive upload failed', { workOrderId: wo.id, error: uploadErr });
  }

  // Audit the Rx-PII read (the PDF carries prescription values).
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'work_order_pdf_viewed',
    entity_type: 'work_orders',
    entity_id: wo.id,
  });

  return new NextResponse(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${wo.work_order_number}.pdf"`,
    },
  });
}
