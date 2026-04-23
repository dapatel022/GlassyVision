'use client';

import Link from 'next/link';
import type { CartLine } from './types';
import { LENS_TYPES, COATINGS, TINTS } from '@/features/shop/lens-options';
import { useCart } from '@/context/CartContext';

function describeLens(config: CartLine['lensConfig']): string {
  const type = LENS_TYPES.find((t) => t.id === config.lensType)?.label ?? config.lensType;
  const coatings = config.coatings
    .map((c) => COATINGS.find((o) => o.id === c)?.label ?? c)
    .join(', ');
  const tint = TINTS.find((t) => t.id === config.tint)?.label ?? config.tint;
  const parts = [type];
  if (coatings) parts.push(coatings);
  if (tint && tint !== 'Clear') parts.push(tint);
  return parts.join(' · ');
}

export default function CartLineItem({ line }: { line: CartLine }) {
  const { updateQty, removeLine } = useCart();

  return (
    <div className="flex gap-4 p-4 border border-line rounded-xl bg-white">
      <div className="w-20 h-20 shrink-0 bg-base-deeper rounded-lg overflow-hidden">
        {line.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.image} alt="" className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/p/${line.productHandle}`} className="font-sans font-bold text-sm text-ink uppercase tracking-wide truncate hover:text-accent">
            {line.title}
          </Link>
          <button onClick={() => removeLine(line.variantId)} className="text-xs text-muted hover:text-error">Remove</button>
        </div>
        <p className="text-xs text-muted mt-1">{describeLens(line.lensConfig)}</p>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateQty(line.variantId, line.quantity - 1)}
              className="w-7 h-7 border border-line rounded text-sm"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="font-mono text-sm w-6 text-center">{line.quantity}</span>
            <button
              onClick={() => updateQty(line.variantId, line.quantity + 1)}
              className="w-7 h-7 border border-line rounded text-sm"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <p className="font-mono text-sm text-ink">${(line.unitPrice * line.quantity).toFixed(0)}</p>
        </div>
      </div>
    </div>
  );
}
