import { createAdminClient } from '@/lib/supabase/admin';
import ShippingQueue from '@/features/lab/components/ShippingQueue';

export const dynamic = 'force-dynamic';

export default async function LabShippingPage() {
  const supabase = createAdminClient();

  const { data: readyJobs } = await supabase
    .from('lab_jobs')
    .select(`
      id, priority,
      work_orders!inner ( id, work_order_number, frame_sku, order_id )
    `)
    .eq('column', 'ship')
    .is('completed_at', null)
    .order('priority', { ascending: false });

  const orderIds = [...new Set(
    (readyJobs ?? []).map((j) => (j as unknown as { work_orders: { order_id: string } }).work_orders.order_id),
  )];
  const { data: orders } = orderIds.length > 0
    ? await supabase.from('orders').select('id, customer_name, shopify_order_number').in('id', orderIds)
    : { data: [] };
  const orderMap = new Map((orders ?? []).map((o) => [o.id, o]));

  const { data: recent } = await supabase
    .from('shipments')
    .select('id, carrier, tracking_number, shipped_at, order_id')
    .eq('direction', 'outbound')
    .order('shipped_at', { ascending: false })
    .limit(10);

  const items = (readyJobs ?? []).map((j) => {
    const wo = (j as unknown as { work_orders: { id: string; work_order_number: string; frame_sku: string; order_id: string } }).work_orders;
    const order = orderMap.get(wo.order_id);
    return {
      jobId: j.id,
      workOrderNumber: wo.work_order_number,
      frameSku: wo.frame_sku,
      customerName: order?.customer_name ?? '—',
      orderNumber: order?.shopify_order_number ?? '—',
      priority: j.priority,
    };
  });

  return (
    <div>
      <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-6">Shipping queue</h1>
      <ShippingQueue items={items} />

      {recent && recent.length > 0 && (
        <section className="mt-12">
          <h2 className="font-sans text-lg font-bold uppercase tracking-wider text-ink mb-3">Recently shipped</h2>
          <div className="space-y-2">
            {recent.map((s) => (
              <div key={s.id} className="p-3 border border-line rounded-lg bg-white flex items-center justify-between text-sm">
                <span className="font-mono">{s.carrier} · {s.tracking_number}</span>
                <span className="text-muted-soft">{s.shipped_at ? new Date(s.shipped_at).toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
