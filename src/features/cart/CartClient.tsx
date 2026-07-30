'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useCart } from '@/context/CartContext';
import CartLineItem from '@/features/cart/CartLineItem';
import type { SiteBanner } from '@/lib/commerce/content';
import type { LensPricingMap } from '@/lib/commerce/lens-pricing';
import { selectedOptionIds } from '@/features/shop/lens-options';
import PromoBanner from '@/components/site/PromoBanner';

export default function CartClient({ banner }: { banner: SiteBanner | null }) {
  const { lines, subtotal, hasRxItems, clear, hydrated } = useCart();
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live Shopify prices for lens upgrades. undefined = loading, null =
  // unavailable (fail closed for lines with paid upgrades).
  const [pricing, setPricing] = useState<LensPricingMap | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/lens-pricing')
      .then((r) => r.json())
      .then((body: { pricing: LensPricingMap | null }) => { if (!cancelled) setPricing(body.pricing); })
      .catch(() => { if (!cancelled) setPricing(null); });
    return () => { cancelled = true; };
  }, []);

  const upgradesTotal = useMemo(
    () => lines.reduce(
      (sum, l) => sum + selectedOptionIds(l.lensConfig).reduce(
        (s, id) => s + (pricing?.[id]?.price ?? 0) * l.quantity, 0),
      0),
    [lines, pricing],
  );
  const hasPaidUpgrades = lines.some((l) => selectedOptionIds(l.lensConfig).length > 0);
  // /checkout would 409 these anyway — block up front with an explanation.
  const upgradesBlocked = pricing === null && hasPaidUpgrades;

  async function handleCheckout() {
    setCheckingOut(true);
    setError(null);
    try {
      const res = await fetch('/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
      const body = await res.json();
      if (!res.ok || !body.checkoutUrl) {
        throw new Error(body.error || 'Checkout failed');
      }
      window.location.href = body.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setCheckingOut(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p role="status" aria-live="polite" className="text-muted font-serif italic">Loading cart…</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-3">
          Your cart is empty
        </h1>
        <p className="text-muted font-serif italic mb-6">No frames selected yet.</p>
        <Link
          href="/shop"
          className="inline-block px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-8">Cart</h1>

      {banner && <div className="mb-6"><PromoBanner banner={banner} /></div>}

      <div className="space-y-3 mb-6">
        {lines.map((l) => <CartLineItem key={`${l.variantId}-${JSON.stringify(l.lensConfig)}`} line={l} pricing={pricing ?? null} />)}
      </div>

      {hasRxItems && (
        <div className="mb-6 p-4 bg-base-deeper border border-line rounded-xl">
          <p className="text-sm font-bold text-ink mb-1">One or more items require a prescription.</p>
          <p className="text-sm text-muted">
            You&apos;ll upload your Rx after checkout. We&apos;ll email you a secure link immediately.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 pt-4 border-t border-line">
        <span className="text-sm font-sans font-bold uppercase tracking-wider text-muted">Subtotal</span>
        <span className="font-mono text-xl text-ink">${(subtotal + upgradesTotal).toFixed(0)}</span>
      </div>
      <p className="text-xs text-muted-soft mb-6">
        Shipping and taxes calculated at checkout.
      </p>

      {upgradesBlocked && (
        <div role="alert" className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
          <p className="text-sm text-amber-900">
            Lens upgrade pricing is temporarily unavailable, so checkout is paused for carts with lens upgrades. Please try again shortly.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-error/20 rounded-lg">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={clear}
          className="px-4 py-3 border border-line text-ink font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-base-deeper"
        >
          Clear
        </button>
        <button
          onClick={handleCheckout}
          disabled={checkingOut || upgradesBlocked}
          className="flex-1 px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50"
        >
          {checkingOut ? 'Redirecting to checkout…' : 'Checkout'}
        </button>
      </div>
    </div>
  );
}
