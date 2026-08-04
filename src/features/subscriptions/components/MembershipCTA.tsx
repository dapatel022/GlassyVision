'use client';

import { useState } from 'react';
import type { MembershipTierPrice } from '@/lib/commerce/membership-pricing';

/**
 * Sends the chosen tier through the normal /checkout route as a plain
 * non-Rx line (no lens config → no add-on lines, no Rx pipeline).
 */
export default function MembershipCTA({ tier, label }: { tier: MembershipTierPrice; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: [{
            productId: 'membership',
            variantId: tier.variantId,
            productHandle: 'membership',
            title: `GlassyVision Membership — ${label}`,
            image: null,
            unitPrice: tier.price,
            quantity: 1,
            lensConfig: { lensType: 'non_rx', coatings: [], tint: 'none' },
          }],
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.checkoutUrl) throw new Error(body.error || 'Checkout failed');
      window.location.href = body.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={buy}
        disabled={busy}
        className="w-full px-4 py-3 bg-ink text-white font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent transition-colors disabled:opacity-50"
      >
        {busy ? 'Redirecting…' : `Choose ${label}`}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-error">{error}</p>}
    </div>
  );
}
