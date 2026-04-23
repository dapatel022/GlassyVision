'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adjustInventory, pushInventoryToShopify } from '../actions/adjust-inventory';

interface Row {
  id: string;
  sku: string;
  frame_shape: string | null;
  color: string | null;
  size: string | null;
  pool_quantity: number;
  threshold_alert: number;
  last_updated_at: string;
}

interface Props {
  rows: Row[];
  userId: string;
}

export default function InventoryTable({ rows, userId }: Props) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function handleAdjust(row: Row) {
    const input = prompt(`Adjust ${row.sku} by how many? (use negative to decrease)`, '1');
    if (input === null) return;
    const delta = Number(input);
    if (isNaN(delta) || delta === 0) return;
    setWorking(row.id);
    const result = await adjustInventory(row.id, delta, 'manual_correction', userId, null);
    if (result.success) {
      router.refresh();
    } else {
      setBanner(result.error ?? 'Adjustment failed');
    }
    setWorking(null);
  }

  async function handlePush(row: Row) {
    setWorking(row.id);
    const result = await pushInventoryToShopify(row.id);
    setBanner(result.message);
    setWorking(null);
  }

  if (rows.length === 0) {
    return <p className="text-muted font-serif italic">No inventory rows yet. SKUs sync from Shopify.</p>;
  }

  return (
    <>
      {banner && (
        <div className="mb-4 p-3 bg-base-deeper border border-line rounded-lg text-sm text-muted">
          {banner} <button onClick={() => setBanner(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}
      <div className="overflow-x-auto border border-line rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-base-deeper">
            <tr>
              <th className="text-left p-3 font-sans font-bold text-xs uppercase tracking-wider text-muted-soft">SKU</th>
              <th className="text-left p-3 font-sans font-bold text-xs uppercase tracking-wider text-muted-soft">Variant</th>
              <th className="text-right p-3 font-sans font-bold text-xs uppercase tracking-wider text-muted-soft">Pool qty</th>
              <th className="text-right p-3 font-sans font-bold text-xs uppercase tracking-wider text-muted-soft">Threshold</th>
              <th className="text-left p-3 font-sans font-bold text-xs uppercase tracking-wider text-muted-soft">Last update</th>
              <th className="text-right p-3 font-sans font-bold text-xs uppercase tracking-wider text-muted-soft">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const low = row.pool_quantity <= row.threshold_alert;
              return (
                <tr key={row.id} className="border-t border-line">
                  <td className="p-3 font-mono">{row.sku}</td>
                  <td className="p-3 text-muted">{[row.frame_shape, row.color, row.size].filter(Boolean).join(' · ') || '—'}</td>
                  <td className={`p-3 text-right font-mono ${low ? 'text-error font-bold' : ''}`}>{row.pool_quantity}</td>
                  <td className="p-3 text-right font-mono text-muted-soft">{row.threshold_alert}</td>
                  <td className="p-3 text-muted-soft text-xs">{new Date(row.last_updated_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleAdjust(row)}
                      disabled={working === row.id}
                      className="text-xs text-accent hover:underline mr-3"
                    >
                      Adjust
                    </button>
                    <button
                      onClick={() => handlePush(row)}
                      disabled={working === row.id}
                      className="text-xs text-muted hover:underline"
                    >
                      Push
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
