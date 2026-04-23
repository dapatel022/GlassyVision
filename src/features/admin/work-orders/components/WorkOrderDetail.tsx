'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { releaseWorkOrder } from '../actions/release-work-order';

interface WorkOrder {
  id: string;
  work_order_number: string;
  frame_sku: string;
  frame_shape: string | null;
  frame_color: string | null;
  frame_size: string | null;
  lens_type: string;
  lens_material: string;
  tint: string | null;
  monocular_pd_od: number | null;
  monocular_pd_os: number | null;
  released_to_lab_at: string | null;
  pdf_storage_path: string | null;
}

interface OrderSummary {
  shopify_order_number: string;
  customer_email: string;
  customer_name: string;
}

interface RxValues {
  typed_od_sphere: string | null;
  typed_od_cylinder: string | null;
  typed_od_axis: string | null;
  typed_os_sphere: string | null;
  typed_os_cylinder: string | null;
  typed_os_axis: string | null;
  typed_pd: string | null;
  rx_expiration_date: string | null;
  storage_path: string;
  rxImageUrl: string;
}

interface Props {
  workOrder: WorkOrder;
  order: OrderSummary;
  rx: RxValues;
}

export default function WorkOrderDetail({ workOrder, order, rx }: Props) {
  const router = useRouter();
  const [releasing, setReleasing] = useState(false);

  async function handleRelease() {
    setReleasing(true);
    await releaseWorkOrder(workOrder.id);
    router.refresh();
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft">
            Work order
          </p>
          <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink">
            {workOrder.work_order_number}
          </h1>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/work-orders/${workOrder.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-line text-ink font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-base-deeper"
          >
            Download PDF
          </a>
          {!workOrder.released_to_lab_at && (
            <button
              onClick={handleRelease}
              disabled={releasing}
              className="px-4 py-2 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50"
            >
              {releasing ? 'Releasing…' : 'Release to lab'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="p-4 border border-line rounded-xl bg-white">
          <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Customer + order</h2>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between"><dt className="text-muted">Order</dt><dd className="font-mono">{order.shopify_order_number}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Name</dt><dd>{order.customer_name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Email</dt><dd className="truncate ml-2">{order.customer_email}</dd></div>
          </dl>
        </section>

        <section className="p-4 border border-line rounded-xl bg-white">
          <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Frame</h2>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between"><dt className="text-muted">SKU</dt><dd className="font-mono">{workOrder.frame_sku}</dd></div>
            {workOrder.frame_shape && <div className="flex justify-between"><dt className="text-muted">Shape</dt><dd>{workOrder.frame_shape}</dd></div>}
            {workOrder.frame_color && <div className="flex justify-between"><dt className="text-muted">Color</dt><dd>{workOrder.frame_color}</dd></div>}
            {workOrder.frame_size && <div className="flex justify-between"><dt className="text-muted">Size</dt><dd>{workOrder.frame_size}</dd></div>}
          </dl>
        </section>

        <section className="p-4 border border-line rounded-xl bg-white md:col-span-2">
          <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Lens specification</h2>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div><dt className="text-muted text-xs uppercase tracking-wider">Type</dt><dd className="font-mono">{workOrder.lens_type}</dd></div>
            <div><dt className="text-muted text-xs uppercase tracking-wider">Material</dt><dd className="font-mono">{workOrder.lens_material}</dd></div>
            <div><dt className="text-muted text-xs uppercase tracking-wider">Tint</dt><dd className="font-mono">{workOrder.tint ?? 'none'}</dd></div>
            <div><dt className="text-muted text-xs uppercase tracking-wider">PD OD / OS</dt><dd className="font-mono">{workOrder.monocular_pd_od ?? '—'} / {workOrder.monocular_pd_os ?? '—'}</dd></div>
          </div>
        </section>

        <section className="p-4 border border-line rounded-xl bg-white md:col-span-2">
          <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Prescription</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-mono mb-4">
            <div><dt className="text-muted text-xs uppercase">OD sphere</dt><dd>{rx.typed_od_sphere ?? '—'}</dd></div>
            <div><dt className="text-muted text-xs uppercase">OD cyl</dt><dd>{rx.typed_od_cylinder ?? '—'}</dd></div>
            <div><dt className="text-muted text-xs uppercase">OD axis</dt><dd>{rx.typed_od_axis ?? '—'}</dd></div>
            <div><dt className="text-muted text-xs uppercase">PD</dt><dd>{rx.typed_pd ?? '—'}</dd></div>
            <div><dt className="text-muted text-xs uppercase">OS sphere</dt><dd>{rx.typed_os_sphere ?? '—'}</dd></div>
            <div><dt className="text-muted text-xs uppercase">OS cyl</dt><dd>{rx.typed_os_cylinder ?? '—'}</dd></div>
            <div><dt className="text-muted text-xs uppercase">OS axis</dt><dd>{rx.typed_os_axis ?? '—'}</dd></div>
            <div><dt className="text-muted text-xs uppercase">Exp</dt><dd>{rx.rx_expiration_date ?? '—'}</dd></div>
          </div>
          <Link
            href={rx.rxImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent underline"
          >
            View uploaded prescription →
          </Link>
        </section>
      </div>

      {workOrder.released_to_lab_at && (
        <div className="mt-6 p-3 bg-success/10 border border-success/20 rounded-lg text-sm text-success">
          Released to lab at {new Date(workOrder.released_to_lab_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}
