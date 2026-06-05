'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { savePlan, type EndOfTermMode, type PlanStatus } from '../actions/save-plan';

interface ExistingPlan {
  id: string;
  name: string;
  pairs_count: number;
  term_months: number;
  redemption_policy: { mode?: string } | null;
  end_of_term_policy: { mode?: string; reminder_days?: number[]; grace_days?: number } | null;
  status: string;
  shopify_product_id: number | null;
  shopify_variant_id: number | null;
}

interface Props {
  existing?: ExistingPlan;
  /** True when the plan has live memberships → terms are locked. */
  termsLocked?: boolean;
}

const END_OF_TERM_MODES: EndOfTermMode[] = ['expire', 'refund', 'rollover'];
const STATUSES: PlanStatus[] = ['draft', 'active', 'archived'];

export default function PlanForm({ existing, termsLocked = false }: Props) {
  const router = useRouter();
  const eot = existing?.end_of_term_policy ?? {};
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    pairsCount: existing?.pairs_count ?? 3,
    termMonths: existing?.term_months ?? 12,
    redemptionMode: existing?.redemption_policy?.mode ?? 'all_immediate',
    endOfTermMode: (eot.mode as EndOfTermMode) ?? 'refund',
    reminderDays: (eot.reminder_days ?? [60, 30, 7]).join(', '),
    graceDays: eot.grace_days ?? 14,
    status: (existing?.status as PlanStatus) ?? 'draft',
    shopifyProductId: existing?.shopify_product_id ?? 0,
    shopifyVariantId: existing?.shopify_variant_id ?? 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const reminderDays = form.reminderDays
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    const result = await savePlan({
      id: existing?.id,
      name: form.name.trim(),
      pairsCount: Number(form.pairsCount),
      termMonths: Number(form.termMonths),
      redemptionMode: form.redemptionMode,
      endOfTermMode: form.endOfTermMode,
      reminderDays,
      graceDays: Number(form.graceDays),
      status: form.status,
      shopifyProductId: form.shopifyProductId ? Number(form.shopifyProductId) : null,
      shopifyVariantId: form.shopifyVariantId ? Number(form.shopifyVariantId) : null,
    });

    if (result.success) {
      router.push(`/admin/plans/${result.id ?? existing?.id}`);
      router.refresh();
    } else {
      setError(result.error ?? 'Save failed');
      setSubmitting(false);
    }
  }

  const labelCls = 'block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1';
  const inputCls = 'w-full px-3 py-2 border border-line rounded-lg text-sm';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 border border-line rounded-xl bg-white">
      <div>
        <label className={labelCls}>Plan name</label>
        <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
      </div>

      {termsLocked && (
        <p className="text-xs font-mono text-muted bg-base border border-line rounded-lg px-3 py-2">
          This plan has live memberships. Pairs / term are frozen and cannot be edited — archive it and create a new plan instead.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Pairs per term</label>
          <input type="number" min={1} required disabled={termsLocked} value={form.pairsCount} onChange={(e) => setForm({ ...form, pairsCount: Number(e.target.value) })} className={`${inputCls} font-mono disabled:opacity-50`} />
        </div>
        <div>
          <label className={labelCls}>Term (months)</label>
          <input type="number" min={1} required disabled={termsLocked} value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: Number(e.target.value) })} className={`${inputCls} font-mono disabled:opacity-50`} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Redemption mode</label>
        <select value={form.redemptionMode} onChange={(e) => setForm({ ...form, redemptionMode: e.target.value })} className={inputCls}>
          <option value="all_immediate">all_immediate</option>
        </select>
      </div>

      <fieldset className="border border-line rounded-lg p-4 space-y-3">
        <legend className="text-xs font-sans font-bold uppercase tracking-wider text-muted px-2">End-of-term policy</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Mode</label>
            <select value={form.endOfTermMode} onChange={(e) => setForm({ ...form, endOfTermMode: e.target.value as EndOfTermMode })} className={inputCls}>
              {END_OF_TERM_MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Grace days</label>
            <input type="number" min={0} value={form.graceDays} onChange={(e) => setForm({ ...form, graceDays: Number(e.target.value) })} className={`${inputCls} font-mono`} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Reminder days (comma-separated)</label>
          <input type="text" value={form.reminderDays} onChange={(e) => setForm({ ...form, reminderDays: e.target.value })} className={`${inputCls} font-mono`} placeholder="60, 30, 7" />
        </div>
      </fieldset>

      <div>
        <label className={labelCls}>Status</label>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PlanStatus })} className={inputCls}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Shopify product id</label>
          <input type="number" value={form.shopifyProductId} onChange={(e) => setForm({ ...form, shopifyProductId: Number(e.target.value) })} className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className={labelCls}>Shopify variant id</label>
          <input type="number" value={form.shopifyVariantId} onChange={(e) => setForm({ ...form, shopifyVariantId: Number(e.target.value) })} className={`${inputCls} font-mono`} />
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <button type="submit" disabled={submitting} className="px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50">
        {submitting ? 'Saving…' : existing ? 'Save changes' : 'Create plan'}
      </button>
    </form>
  );
}
