'use client';

import type { LensConfig, LensType } from '@/features/cart/types';
import { LENS_TYPES, COATINGS, TINTS } from './lens-options';

interface LensPickerProps {
  value: LensConfig;
  onChange: (next: LensConfig) => void;
}

export default function LensPicker({ value, onChange }: LensPickerProps) {
  function setLensType(t: LensType) {
    onChange({ ...value, lensType: t });
  }
  function toggleCoating(id: string) {
    const has = value.coatings.includes(id);
    onChange({ ...value, coatings: has ? value.coatings.filter((c) => c !== id) : [...value.coatings, id] });
  }
  function setTint(id: string) {
    onChange({ ...value, tint: id });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-3">Lens type</p>
        <div className="space-y-2">
          {LENS_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setLensType(t.id)}
              className={`w-full p-3 border rounded-lg text-left transition-colors ${
                value.lensType === t.id ? 'border-accent bg-accent/5' : 'border-line hover:border-accent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-sans font-bold text-sm text-ink">{t.label}</span>
                <span className="text-sm text-muted font-mono">+${t.priceDelta}</span>
              </div>
              {t.description && <p className="text-xs text-muted-soft mt-1">{t.description}</p>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-3">Coatings</p>
        <div className="space-y-2">
          {COATINGS.map((c) => {
            const selected = value.coatings.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCoating(c.id)}
                className={`w-full p-3 border rounded-lg text-left transition-colors ${
                  selected ? 'border-accent bg-accent/5' : 'border-line hover:border-accent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">{c.label}</span>
                  <span className="text-sm text-muted font-mono">
                    {selected ? '✓' : ''} +${c.priceDelta}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-3">Tint</p>
        <div className="grid grid-cols-2 gap-2">
          {TINTS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTint(t.id)}
              className={`p-3 border rounded-lg text-center transition-colors ${
                value.tint === t.id ? 'border-accent bg-accent/5' : 'border-line hover:border-accent'
              }`}
            >
              <p className="text-sm text-ink">{t.label}</p>
              {t.priceDelta > 0 && <p className="text-xs text-muted font-mono mt-1">+${t.priceDelta}</p>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
