'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import CartLineItem from '@/features/cart/CartLineItem';

export default function CartPage() {
  const { lines, subtotal, hasRxItems, clear, hydrated } = useCart();
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <p className="text-muted font-serif italic">Loading cart…</p>
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

      <div className="space-y-3 mb-6">
        {lines.map((l) => <CartLineItem key={`${l.variantId}-${JSON.stringify(l.lensConfig)}`} line={l} />)}
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
        <span className="font-mono text-xl text-ink">${subtotal.toFixed(0)}</span>
      </div>
      <p className="text-xs text-muted-soft mb-6">
        Shipping and taxes calculated at checkout.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-error/20 rounded-lg">
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
          disabled={checkingOut}
          className="flex-1 px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50"
        >
          {checkingOut ? 'Redirecting to checkout…' : 'Checkout'}
        </button>
      </div>
    </div>
  );
}
