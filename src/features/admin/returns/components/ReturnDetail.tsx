'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reviewReturn } from '../actions/review-return';
import type { Database } from '@/lib/supabase/types';

type AdminDecision = Database['public']['Enums']['return_admin_decision'];

interface ReturnRow {
  id: string;
  rma_number: string;
  customer_email: string;
  reason: string;
  reason_detail: string | null;
  request_type: string;
  preferred_resolution: string | null;
  admin_decision: AdminDecision;
  admin_notes: string | null;
  status: string;
  created_at: string;
  order_id: string;
}

interface Order {
  shopify_order_number: string;
  customer_name: string;
  total: number;
}

interface LineItem {
  product_title: string;
  variant_title: string | null;
  line_total: number;
}

interface Props {
  ret: ReturnRow;
  order: Order;
  lineItem: LineItem | null;
  reviewerUserId: string;
}

const DECISIONS: Array<{ value: AdminDecision; label: string }> = [
  { value: 'approved_refund', label: 'Approve refund' },
  { value: 'approved_replacement', label: 'Approve replacement' },
  { value: 'approved_credit', label: 'Approve store credit' },
  { value: 'approved_remake', label: 'Approve remake' },
  { value: 'rejected', label: 'Reject' },
];

export default function ReturnDetail({ ret, order, lineItem, reviewerUserId }: Props) {
  const router = useRouter();
  const [decision, setDecision] = useState<AdminDecision>('approved_refund');
  const [notes, setNotes] = useState(ret.admin_notes ?? '');
  const [creditAmount, setCreditAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = ret.status !== 'pending';

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await reviewReturn({
      returnId: ret.id,
      reviewerUserId,
      decision,
      adminNotes: notes || null,
      storeCreditAmount: decision === 'approved_credit' && creditAmount ? Number(creditAmount) : null,
    });
    if (result.success) {
      router.refresh();
    } else {
      setError(result.error ?? 'Failed');
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/returns" className="text-sm text-muted hover:text-ink">← Back to queue</Link>

      <div className="flex items-center justify-between mt-4 mb-6">
        <div>
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft">Return request</p>
          <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink">{ret.rma_number}</h1>
        </div>
        <span className={`text-xs font-mono uppercase tracking-wider px-2 py-1 rounded-full ${
          ret.status === 'pending' ? 'bg-warning/10 text-warning' :
          ret.status === 'rejected' ? 'bg-error/10 text-error' : 'bg-success/10 text-success'
        }`}>
          {ret.status}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <section className="p-4 border border-line rounded-xl bg-white">
          <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Customer + order</h2>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between"><dt className="text-muted">Order</dt><dd className="font-mono">{order.shopify_order_number}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Name</dt><dd>{order.customer_name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Email</dt><dd className="truncate ml-2">{ret.customer_email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Total</dt><dd className="font-mono">${Number(order.total).toFixed(2)}</dd></div>
          </dl>
        </section>

        <section className="p-4 border border-line rounded-xl bg-white">
          <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Item</h2>
          {lineItem ? (
            <dl className="text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-muted">Product</dt><dd>{lineItem.product_title}</dd></div>
              {lineItem.variant_title && <div className="flex justify-between"><dt className="text-muted">Variant</dt><dd>{lineItem.variant_title}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Line total</dt><dd className="font-mono">${Number(lineItem.line_total).toFixed(2)}</dd></div>
            </dl>
          ) : (
            <p className="text-muted font-serif italic">Whole order (no specific line item)</p>
          )}
        </section>

        <section className="p-4 border border-line rounded-xl bg-white md:col-span-2">
          <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Request</h2>
          <dl className="text-sm space-y-1 mb-3">
            <div className="flex justify-between"><dt className="text-muted">Reason</dt><dd>{ret.reason.replace(/_/g, ' ')}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Type</dt><dd>{ret.request_type}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Preferred resolution</dt><dd>{ret.preferred_resolution?.replace(/_/g, ' ') || '—'}</dd></div>
          </dl>
          {ret.reason_detail && (
            <div>
              <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Customer note</p>
              <p className="text-sm text-ink bg-base-deeper rounded-lg p-3 font-serif">{ret.reason_detail}</p>
            </div>
          )}
        </section>
      </div>

      {!locked ? (
        <section className="p-4 border border-line rounded-xl bg-white">
          <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Decision</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Outcome</label>
              <select value={decision} onChange={(e) => setDecision(e.target.value as AdminDecision)} className="w-full px-3 py-2 border border-line rounded-lg text-sm">
                {DECISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            {decision === 'approved_credit' && (
              <div>
                <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Store credit amount (USD)</label>
                <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className="w-full px-3 py-2 border border-line rounded-lg text-sm font-mono" />
              </div>
            )}
            <div>
              <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Internal notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-line rounded-lg text-sm" />
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            {decision === 'approved_refund' && (
              <p className="text-xs text-muted-soft">
                Shopify refund API call is stubbed until store credentials are configured.
              </p>
            )}
            <button onClick={handleSubmit} disabled={submitting} className="px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50">
              {submitting ? 'Saving…' : 'Save decision'}
            </button>
          </div>
        </section>
      ) : (
        <section className="p-4 border border-line rounded-xl bg-base-deeper">
          <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-2">Decision on record</h2>
          <p className="text-sm text-ink mb-1">{ret.admin_decision.replace(/_/g, ' ')}</p>
          {ret.admin_notes && <p className="text-sm text-muted font-serif">{ret.admin_notes}</p>}
        </section>
      )}
    </div>
  );
}
