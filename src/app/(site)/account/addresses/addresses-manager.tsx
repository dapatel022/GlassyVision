'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from '@/features/account/addresses/actions/save-address';

export interface SavedAddress {
  id: string;
  label: string | null;
  recipientName: string;
  isDefault: boolean;
  address: {
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    country_code?: string;
  };
}

interface Props {
  addresses: SavedAddress[];
}

const EMPTY_FORM = {
  label: '',
  recipientName: '',
  address1: '',
  address2: '',
  city: '',
  province: '',
  zip: '',
  country_code: 'US',
  isDefault: false,
};

const inputClass =
  'w-full px-4 py-3 bg-white border border-line text-ink font-sans text-sm focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none';

export default function AddressesManager({ addresses }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setError('');
  }

  function beginEdit(a: SavedAddress) {
    setEditingId(a.id);
    setError('');
    setForm({
      label: a.label ?? '',
      recipientName: a.recipientName,
      address1: a.address.address1 ?? '',
      address2: a.address.address2 ?? '',
      city: a.address.city ?? '',
      province: a.address.province ?? '',
      zip: a.address.zip ?? '',
      country_code: a.address.country_code ?? 'US',
      isDefault: a.isDefault,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const payload = {
      recipientName: form.recipientName,
      label: form.label,
      isDefault: form.isDefault,
      address: {
        address1: form.address1,
        address2: form.address2,
        city: form.city,
        province: form.province,
        zip: form.zip,
        country_code: form.country_code,
      },
    };
    const result = editingId
      ? await updateAddress(editingId, payload)
      : await addAddress(payload);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    resetForm();
    router.refresh();
  }

  async function handleDelete(id: string) {
    setBusy(true);
    const result = await deleteAddress(id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (editingId === id) resetForm();
    router.refresh();
  }

  async function handleSetDefault(id: string) {
    setBusy(true);
    const result = await setDefaultAddress(id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        {addresses.length === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t saved any addresses yet.</p>
        ) : (
          <ul className="space-y-2">
            {addresses.map((a) => (
              <li key={a.id} className="border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm text-ink">
                    <p className="font-sans font-bold">
                      {a.recipientName}
                      {a.label && <span className="text-muted font-normal ml-2">({a.label})</span>}
                      {a.isDefault && (
                        <span className="text-xs font-mono uppercase tracking-widest text-accent ml-2">
                          Default
                        </span>
                      )}
                    </p>
                    <p className="text-muted mt-1">
                      {[a.address.address1, a.address.address2].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-muted">
                      {[a.address.city, a.address.province, a.address.zip, a.address.country_code]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs font-mono">
                    <button type="button" onClick={() => beginEdit(a)} disabled={busy}
                      className="text-muted underline disabled:opacity-50">Edit</button>
                    {!a.isDefault && (
                      <button type="button" onClick={() => handleSetDefault(a.id)} disabled={busy}
                        className="text-muted underline disabled:opacity-50">Make default</button>
                    )}
                    <button type="button" onClick={() => handleDelete(a.id)} disabled={busy}
                      className="text-error underline disabled:opacity-50">Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">
          {editingId ? 'Edit address' : 'Add an address'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input className={inputClass} placeholder="Label (e.g. Home, Work)" value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input className={inputClass} placeholder="Recipient full name" value={form.recipientName}
            onChange={(e) => setForm({ ...form, recipientName: e.target.value })} required />
          <input className={inputClass} placeholder="Address line 1" value={form.address1}
            onChange={(e) => setForm({ ...form, address1: e.target.value })} required />
          <input className={inputClass} placeholder="Address line 2 (optional)" value={form.address2}
            onChange={(e) => setForm({ ...form, address2: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="City" value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })} required />
            <input className={inputClass} placeholder="State / Province" value={form.province}
              onChange={(e) => setForm({ ...form, province: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="ZIP / Postal code" value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })} required />
            <select className={inputClass} value={form.country_code}
              onChange={(e) => setForm({ ...form, country_code: e.target.value })}>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            Set as default shipping address
          </label>

          {error && <p className="text-error text-xs font-mono">{error}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy}
              className="py-3 px-6 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase disabled:opacity-50">
              {busy ? 'Working…' : editingId ? 'Save changes' : 'Add address'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} disabled={busy}
                className="text-xs font-mono text-muted underline disabled:opacity-50">Cancel</button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
