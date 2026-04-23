'use client';

import type { ShopifyVariant } from '@/lib/commerce/types';

interface VariantPickerProps {
  variants: ShopifyVariant[];
  selectedId: string;
  onSelect: (variantId: string) => void;
}

export default function VariantPicker({ variants, selectedId, onSelect }: VariantPickerProps) {
  if (variants.length <= 1) return null;

  return (
    <div>
      <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-2">
        Color / Size
      </p>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            disabled={!v.availableForSale}
            className={`px-4 py-2 border rounded-lg text-sm font-sans font-bold uppercase tracking-wider transition-colors ${
              v.id === selectedId
                ? 'border-accent bg-accent text-white'
                : 'border-line text-ink hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            {v.title}
            {!v.availableForSale && ' · Sold out'}
          </button>
        ))}
      </div>
    </div>
  );
}
