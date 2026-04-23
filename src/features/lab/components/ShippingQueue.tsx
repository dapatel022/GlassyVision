'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createShipment } from '../actions/create-shipment';

interface Item {
  jobId: string;
  workOrderNumber: string;
  frameSku: string;
  customerName: string;
  orderNumber: string;
  priority: number;
}

const CARRIERS = ['DHL', 'FedEx', 'Shiprocket', 'India Post', 'Aramex'];

interface Props {
  items: Item[];
}

export default function ShippingQueue({ items }: Props) {
  const router = useRouter();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [forms, setForms] = useState<Record<string, { carrier: string; trackingNumber: string }>>(() =>
    Object.fromEntries(items.map((i) => [i.jobId, { carrier: CARRIERS[0], trackingNumber: '' }])),
  );

  function update(jobId: string, patch: Partial<{ carrier: string; trackingNumber: string }>) {
    setForms((prev) => ({ ...prev, [jobId]: { ...prev[jobId], ...patch } }));
  }

  async function handleShip(jobId: string) {
    const form = forms[jobId];
    if (!form.trackingNumber.trim()) {
      setErrors((prev) => ({ ...prev, [jobId]: 'Tracking number required' }));
      return;
    }
    setSubmittingId(jobId);
    setErrors((prev) => ({ ...prev, [jobId]: '' }));
    const result = await createShipment({
      jobId,
      carrier: form.carrier,
      trackingNumber: form.trackingNumber.trim(),
    });
    if (result.success) {
      router.refresh();
    } else {
      setErrors((prev) => ({ ...prev, [jobId]: result.error ?? 'Ship failed' }));
    }
    setSubmittingId(null);
  }

  if (items.length === 0) {
    return <p className="text-muted font-serif italic">Nothing ready to ship.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.jobId} className="p-4 border border-line rounded-xl bg-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-mono text-xs text-accent">{item.workOrderNumber}</p>
              <p className="font-sans font-bold text-sm text-ink">{item.frameSku}</p>
              <p className="text-xs text-muted">{item.customerName} · {item.orderNumber}</p>
            </div>
            <span className="text-xs font-mono text-muted">P{item.priority}</span>
          </div>

          <div className="flex gap-2 items-end">
            <div>
              <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Carrier</label>
              <select
                value={forms[item.jobId].carrier}
                onChange={(e) => update(item.jobId, { carrier: e.target.value })}
                className="px-3 py-2 border border-line rounded-lg text-sm"
              >
                {CARRIERS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Tracking #</label>
              <input
                type="text"
                value={forms[item.jobId].trackingNumber}
                onChange={(e) => update(item.jobId, { trackingNumber: e.target.value })}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm font-mono"
                placeholder="e.g. 1Z999AA10123456784"
              />
            </div>
            <button
              onClick={() => handleShip(item.jobId)}
              disabled={submittingId === item.jobId}
              className="px-4 py-2 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50"
            >
              {submittingId === item.jobId ? 'Shipping…' : 'Ship'}
            </button>
          </div>

          {errors[item.jobId] && (
            <p className="text-sm text-error mt-2">{errors[item.jobId]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
