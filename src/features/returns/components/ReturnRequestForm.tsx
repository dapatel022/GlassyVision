'use client';

import { useState } from 'react';
import { requestReturn } from '../actions/request-return';
import type { Database } from '@/lib/supabase/types';

type ReturnReason = Database['public']['Enums']['return_reason'];
type ReturnResolution = Database['public']['Enums']['return_resolution'];

interface LineItem {
  id: string;
  productTitle: string;
  variantTitle: string | null;
  isRxRequired: boolean;
}

interface Props {
  orderDbId: string;
  lineItems: LineItem[];
}

const REASONS: Array<{ value: ReturnReason; label: string; requestType: 'return' | 'replacement' | 'remake' }> = [
  { value: 'damaged', label: 'Arrived damaged', requestType: 'replacement' },
  { value: 'defective', label: 'Manufacturing defect', requestType: 'replacement' },
  { value: 'wrong_size', label: 'Wrong size or fit', requestType: 'return' },
  { value: 'wrong_rx_our_fault', label: 'Rx is wrong — our mistake', requestType: 'remake' },
  { value: 'wrong_rx_typed', label: 'I uploaded the wrong Rx values', requestType: 'remake' },
  { value: 'change_of_mind', label: 'Changed my mind', requestType: 'return' },
  { value: 'other', label: 'Something else', requestType: 'return' },
];

const RESOLUTIONS: Array<{ value: ReturnResolution; label: string }> = [
  { value: 'refund', label: 'Refund' },
  { value: 'replacement', label: 'Replacement' },
  { value: 'store_credit', label: 'Store credit' },
];

export default function ReturnRequestForm({ orderDbId, lineItems }: Props) {
  const [lineItemId, setLineItemId] = useState(lineItems[0]?.id ?? '');
  const [reason, setReason] = useState<ReturnReason>('damaged');
  const [reasonDetail, setReasonDetail] = useState('');
  const [resolution, setResolution] = useState<ReturnResolution>('refund');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: true; rmaNumber: string } | { success: false; error: string } | null>(null);

  const selectedReason = REASONS.find((r) => r.value === reason)!;
  const selectedLineItem = lineItems.find((li) => li.id === lineItemId);
  const rxOurFaultBlocked = selectedReason.value === 'wrong_rx_our_fault' && !selectedLineItem?.isRxRequired;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rxOurFaultBlocked) return;
    setSubmitting(true);

    const r = await requestReturn({
      orderId: orderDbId,
      lineItemId,
      requestType: selectedReason.requestType,
      reason,
      reasonDetail,
      preferredResolution: resolution,
      photoUrls: [],
    });
    setResult(r);
    setSubmitting(false);
  }

  if (result?.success) {
    return (
      <div className="p-6 border border-success/20 bg-success/10 rounded-xl text-center">
        <h2 className="font-sans text-xl font-black uppercase tracking-tight text-ink mb-2">Return requested</h2>
        <p className="text-sm text-muted mb-3">Your RMA number is:</p>
        <p className="font-mono text-lg text-ink mb-4">{result.rmaNumber}</p>
        <p className="text-xs text-muted">
          We&apos;ll email you within one business day with next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-white p-6 border border-line rounded-xl">
      <div>
        <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">
          Which item?
        </label>
        <select
          value={lineItemId}
          onChange={(e) => setLineItemId(e.target.value)}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm"
        >
          {lineItems.map((li) => (
            <option key={li.id} value={li.id}>
              {li.productTitle}{li.variantTitle ? ` — ${li.variantTitle}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">
          What happened?
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as ReturnReason)}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm"
        >
          {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {rxOurFaultBlocked && (
          <p className="text-xs text-error mt-1">
            This reason only applies to prescription items — please pick a different reason or item.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">
          Tell us more (optional)
        </label>
        <textarea
          value={reasonDetail}
          onChange={(e) => setReasonDetail(e.target.value)}
          rows={4}
          placeholder="Describe the issue in your own words…"
          className="w-full px-3 py-2 border border-line rounded-lg text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">
          What would you like?
        </label>
        <div className="flex gap-2">
          {RESOLUTIONS.map((r) => (
            <button
              type="button"
              key={r.value}
              onClick={() => setResolution(r.value)}
              className={`px-3 py-2 border rounded-lg text-sm font-sans font-bold uppercase tracking-wider ${
                resolution === r.value ? 'border-accent bg-accent text-white' : 'border-line text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {result && !result.success && (
        <p className="text-sm text-error">{result.error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || rxOurFaultBlocked}
        className="w-full px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit return request'}
      </button>
    </form>
  );
}
