'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRedemption } from '@/features/subscriptions/actions/start-redemption';

export interface FrameOption {
  variantId: number;
  sku: string;
  shape: string | null;
  isPremium: boolean;
}

export interface AddonOption {
  key: string;
  label: string;
  price: number;
}

interface Props {
  slotId: string;
  frames: FrameOption[];
  addons: AddonOption[];
}

export default function RedeemForm({ slotId, frames, addons }: Props) {
  const router = useRouter();
  const [frameVariantId, setFrameVariantId] = useState<number | null>(frames[0]?.variantId ?? null);
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [ship, setShip] = useState({
    name: '',
    address1: '',
    address2: '',
    city: '',
    province: '',
    zip: '',
    country_code: 'US',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function toggleAddon(key: string) {
    setSelectedAddons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (frameVariantId == null) {
      setError('Please choose a frame.');
      return;
    }
    setLoading(true);
    const result = await startRedemption({
      slotId,
      frameVariantId,
      lensConfig: {},
      shipTo: ship,
      addonKeys: Array.from(selectedAddons),
    });
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    router.push('/account/subscription');
  }

  const inputClass =
    'w-full px-4 py-3 bg-white border border-line text-ink font-sans text-sm focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none';

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Choose a frame</h2>
        {frames.length === 0 ? (
          <p className="text-sm text-muted">No frames are currently available for subscription.</p>
        ) : (
          <div className="space-y-2">
            {frames.map((f) => (
              <label
                key={f.variantId}
                className={`flex items-center justify-between border p-4 cursor-pointer ${
                  frameVariantId === f.variantId ? 'border-accent bg-white' : 'border-line bg-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="frame"
                    checked={frameVariantId === f.variantId}
                    onChange={() => setFrameVariantId(f.variantId)}
                  />
                  <span>
                    <span className="font-sans font-bold text-sm text-ink">{f.sku}</span>
                    {f.shape && <span className="text-sm text-muted ml-2 capitalize">{f.shape}</span>}
                  </span>
                </span>
                {f.isPremium && (
                  <span className="text-xs font-mono uppercase tracking-widest text-accent">
                    Premium · surcharge
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Lens options</h2>
        {addons.length === 0 ? (
          <p className="text-sm text-muted">No add-on lens options available.</p>
        ) : (
          <div className="space-y-2">
            {addons.map((a) => (
              <label key={a.key} className="flex items-center justify-between border border-line bg-white p-4 cursor-pointer">
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedAddons.has(a.key)}
                    onChange={() => toggleAddon(a.key)}
                  />
                  <span className="font-sans text-sm text-ink">{a.label}</span>
                </span>
                {a.price > 0 && (
                  <span className="text-xs font-mono text-muted">+${a.price.toFixed(2)}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Ship to</h2>
        <input className={inputClass} placeholder="Full name" value={ship.name}
          onChange={(e) => setShip({ ...ship, name: e.target.value })} required />
        <input className={inputClass} placeholder="Address line 1" value={ship.address1}
          onChange={(e) => setShip({ ...ship, address1: e.target.value })} required />
        <input className={inputClass} placeholder="Address line 2 (optional)" value={ship.address2}
          onChange={(e) => setShip({ ...ship, address2: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass} placeholder="City" value={ship.city}
            onChange={(e) => setShip({ ...ship, city: e.target.value })} required />
          <input className={inputClass} placeholder="State / Province" value={ship.province}
            onChange={(e) => setShip({ ...ship, province: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass} placeholder="ZIP / Postal code" value={ship.zip}
            onChange={(e) => setShip({ ...ship, zip: e.target.value })} required />
          <select className={inputClass} value={ship.country_code}
            onChange={(e) => setShip({ ...ship, country_code: e.target.value })}>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </div>
      </section>

      {error && <p className="text-error text-xs font-mono">{error}</p>}

      <button type="submit" disabled={loading}
        className="w-full py-3 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase disabled:opacity-50">
        {loading ? 'Working…' : 'Continue'}
      </button>
    </form>
  );
}
