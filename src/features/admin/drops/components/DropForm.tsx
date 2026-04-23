'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDrop, updateDrop } from '../actions/save-drop';
import type { Database } from '@/lib/supabase/types';

type DropState = Database['public']['Enums']['drop_state'];

interface ExistingDrop {
  id: string;
  slug: string;
  name: string;
  number: number;
  hero_headline: string | null;
  hero_copy: string | null;
  starts_at: string;
  ends_at: string;
  state: DropState;
  total_capacity: number | null;
}

interface Props {
  existing?: ExistingDrop;
}

const STATES: DropState[] = ['draft', 'scheduled', 'live', 'sold_out', 'closed'];

function toInputDate(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${min}`;
}

export default function DropForm({ existing }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    slug: existing?.slug ?? '',
    name: existing?.name ?? '',
    number: existing?.number ?? 1,
    heroHeadline: existing?.hero_headline ?? '',
    heroCopy: existing?.hero_copy ?? '',
    startsAt: existing ? toInputDate(existing.starts_at) : '',
    endsAt: existing ? toInputDate(existing.ends_at) : '',
    state: existing?.state ?? ('draft' as DropState),
    totalCapacity: existing?.total_capacity ?? 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      number: Number(form.number),
      heroHeadline: form.heroHeadline.trim() || null,
      heroCopy: form.heroCopy.trim() || null,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      state: form.state,
      totalCapacity: form.totalCapacity ? Number(form.totalCapacity) : null,
    };

    const result = existing ? await updateDrop(existing.id, payload) : await createDrop(payload);

    if (result.success) {
      router.push(`/admin/drops/${payload.slug}`);
      router.refresh();
    } else {
      setError(result.error ?? 'Save failed');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 border border-line rounded-xl bg-white">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Slug</label>
          <input type="text" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} pattern="[a-z0-9-]+" className="w-full px-3 py-2 border border-line rounded-lg text-sm font-mono" placeholder="drop-01" />
        </div>
        <div>
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Number</label>
          <input type="number" required value={form.number} onChange={(e) => setForm({ ...form, number: Number(e.target.value) })} className="w-full px-3 py-2 border border-line rounded-lg text-sm font-mono" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Name</label>
        <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-sm" />
      </div>

      <div>
        <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Hero headline</label>
        <input type="text" value={form.heroHeadline} onChange={(e) => setForm({ ...form, heroHeadline: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-sm" />
      </div>

      <div>
        <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Hero copy</label>
        <textarea value={form.heroCopy} onChange={(e) => setForm({ ...form, heroCopy: e.target.value })} rows={3} className="w-full px-3 py-2 border border-line rounded-lg text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Starts</label>
          <input type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Ends</label>
          <input type="datetime-local" required value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">State</label>
          <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value as DropState })} className="w-full px-3 py-2 border border-line rounded-lg text-sm">
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Total capacity</label>
          <input type="number" value={form.totalCapacity} onChange={(e) => setForm({ ...form, totalCapacity: Number(e.target.value) })} className="w-full px-3 py-2 border border-line rounded-lg text-sm font-mono" />
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <button type="submit" disabled={submitting} className="px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50">
        {submitting ? 'Saving…' : existing ? 'Save changes' : 'Create drop'}
      </button>
    </form>
  );
}
