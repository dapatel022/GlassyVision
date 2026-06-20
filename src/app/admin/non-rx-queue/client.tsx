'use client';

import { useState, useTransition } from 'react';
import { generateNonRxWorkOrder } from '@/features/admin/actions/generate-non-rx-work-order';
import type { NonRxQueueItem } from '@/features/admin/lib/non-rx-queue';

export default function NonRxQueueClient({ items }: { items: NonRxQueueItem[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  function release(lineItemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await generateNonRxWorkOrder(lineItemId);
      if (result.success) setDone((d) => new Set(d).add(lineItemId));
      else setError(result.error);
    });
  }

  return (
    <div className="p-6">
      <h1 className="font-sans font-black text-xl uppercase tracking-wider mb-4">Non-Rx Queue</h1>
      <p className="text-muted-soft text-sm mb-4">
        Sunglasses / plano items awaiting release to the lab. No prescription review — just release to start fulfillment.
      </p>
      {error && <p className="text-red-500 mb-3">{error}</p>}
      {items.length === 0 ? (
        <p className="text-muted-soft">No non-Rx items waiting for release.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.lineItemId} className="flex items-center justify-between border border-white/10 rounded p-3">
              <span className="text-sm">
                #{it.orderNumber ?? it.orderId.slice(0, 8)} — {it.productTitle} ({it.sku ?? 'no sku'}) → {it.country ?? '?'}
              </span>
              <button
                disabled={pending || done.has(it.lineItemId)}
                onClick={() => release(it.lineItemId)}
                className="px-3 py-1 bg-accent text-black font-bold rounded disabled:opacity-50"
              >
                {done.has(it.lineItemId) ? 'Released' : 'Release to lab'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
