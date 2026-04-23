import { createAdminClient } from '@/lib/supabase/admin';
import KanbanBoard from '@/features/lab/components/KanbanBoard';
import type { KanbanJob } from '@/features/lab/components/types';

export const dynamic = 'force-dynamic';

export default async function LabDashboard() {
  const supabase = createAdminClient();

  const { data: jobs } = await supabase
    .from('lab_jobs')
    .select(`
      id, column, priority, qc_photos, started_at, assigned_to,
      work_orders!inner ( id, work_order_number, frame_sku, order_id )
    `)
    .is('completed_at', null)
    .order('priority', { ascending: false });

  const workOrderRows = (jobs ?? []).map((j) => {
    const wo = (j as unknown as { work_orders: { id: string; work_order_number: string; frame_sku: string; order_id: string } }).work_orders;
    return { jobId: j.id, orderId: wo.order_id };
  });

  const orderIds = [...new Set(workOrderRows.map((r) => r.orderId))];
  const { data: orders } = orderIds.length > 0
    ? await supabase.from('orders').select('id, customer_name').in('id', orderIds)
    : { data: [] };
  const orderMap = new Map((orders ?? []).map((o) => [o.id, o.customer_name]));

  const assigneeIds = [...new Set((jobs ?? []).map((j) => j.assigned_to).filter((x): x is string => !!x))];
  const { data: assignees } = assigneeIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', assigneeIds)
    : { data: [] };
  const assigneeMap = new Map((assignees ?? []).map((p) => [p.id, p.full_name]));

  const kanbanJobs: KanbanJob[] = (jobs ?? []).map((j) => {
    const wo = (j as unknown as { work_orders: { id: string; work_order_number: string; frame_sku: string; order_id: string } }).work_orders;
    const qcPhotos = (j.qc_photos as unknown as unknown[]) ?? [];
    return {
      id: j.id,
      workOrderId: wo.id,
      workOrderNumber: wo.work_order_number,
      frameSku: wo.frame_sku,
      customerName: orderMap.get(wo.order_id) ?? '—',
      priority: j.priority,
      column: j.column,
      assigneeName: j.assigned_to ? (assigneeMap.get(j.assigned_to) ?? null) : null,
      qcPhotoCount: qcPhotos.length,
      startedAt: j.started_at,
    };
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">Lab kanban</h1>
          <p className="text-sm text-muted font-serif italic">{kanbanJobs.length} active jobs</p>
        </div>
        <a
          href="/lab/shipping"
          className="px-4 py-2 border border-line text-ink font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-base-deeper"
        >
          Shipping queue →
        </a>
      </div>
      <KanbanBoard jobs={kanbanJobs} />
    </div>
  );
}
