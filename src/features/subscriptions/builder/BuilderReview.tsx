'use client';

import { useState } from 'react';
import type { BuilderState } from './builder-state';
import { TIER_LABELS, type Tier } from './builder-state';
import type { BuilderData, BuilderFrame } from '@/features/subscriptions/lib/builder-data';
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';
import { pairAddonTotal } from './pair-pricing';
import { builderTotals } from './builder-totals';

/**
 * Review step: per-pair recap, the risk-reversal strip, and the checkout
 * handoff. Fetch/busy/error handling below follows the same fetch → busy →
 * error pattern used by every other "buy" entry point on the site (POST
 * /checkout, redirect on `checkoutUrl`, surface `error` on failure).
 *
 * The checkout button (and the sticky total, separately) both gate on
 * builderTotals: `totals === null` covers "no tier" / "pricing outage",
 * `totals.blocked` covers "a configured pair can't be fully priced" — never
 * hardcode a price or send a config we can't account for.
 */

const LENS_TYPE_LABELS: Record<PairConfig['l'], string> = {
  non_rx: 'Non-Rx',
  single_vision: 'Single Vision',
  progressive: 'Progressive',
};

const TINT_LABELS: Record<PairConfig['t'], string> = { none: 'Clear', grey: 'Grey', amber: 'Amber', green: 'Green' };

function pairSummary(pair: PairConfig | null, frames: BuilderFrame[]): string {
  if (!pair) return 'OPEN SLOT · redeem anytime';
  const frame = frames.find((f) => f.handle === pair.h);
  const parts = [frame?.title ?? pair.h, LENS_TYPE_LABELS[pair.l], TINT_LABELS[pair.t]];
  if (pair.b) parts.push('Blue Light');
  if (pair.u.includes('photochromic')) parts.push('Photochromic');
  return parts.join(' · ');
}

export default function BuilderReview({ state, data, tier }: { state: BuilderState; data: BuilderData; tier: Tier }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tierRecord = data.tiers?.find((t) => t.tier === tier) ?? null;
  const totals = builderTotals(state, data);
  const label = TIER_LABELS[tier];

  async function buy() {
    if (!tierRecord || !totals) return;
    setBusy(true);
    setError(null);
    try {
      const pairConfigs = state.pairs.filter((p): p is PairConfig => p !== null);
      const res = await fetch('/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: [{
            productId: 'membership',
            variantId: tierRecord.variantId,
            productHandle: 'membership',
            title: `GlassyVision Membership — ${label}`,
            image: null,
            unitPrice: tierRecord.price,
            quantity: 1,
            lensConfig: { lensType: 'non_rx', coatings: [], tint: 'none' },
            pairConfigs,
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

  const blockedNotice = !tierRecord || !totals
    ? 'Membership pricing is temporarily unavailable — please check back shortly.'
    : totals.blocked
      ? "Part of your plan can't be priced right now — adjust your pairs or try again shortly."
      : null;

  return (
    <div className="space-y-6">
      <div className="border border-line divide-y divide-line">
        {state.pairs.map((pair, i) => {
          const frame = pair ? data.frames.find((f) => f.handle === pair.h) : undefined;
          const addon = pair ? pairAddonTotal(pair, frame?.premium ?? false, data.lensPricing, data.surcharge) : null;
          return (
            <div key={i} className="p-4 flex items-center justify-between gap-4">
              <p className="font-mono text-xs text-ink">
                <span className="font-bold uppercase tracking-widest text-muted-soft">PAIR {String(i + 1).padStart(2, '0')}</span>
                {' — '}
                {pairSummary(pair, data.frames)}
              </p>
              <span className="font-mono text-xs font-bold text-ink whitespace-nowrap">
                {pair === null ? '' : addon === null ? 'Unavailable' : `+$${addon.toFixed(0)}`}
              </span>
            </div>
          );
        })}
      </div>

      <p className="font-mono text-[11px] text-muted-soft flex flex-wrap gap-x-2 gap-y-1">
        <span>Prorated refunds</span>
        <span aria-hidden="true">·</span>
        <span>No auto-renew</span>
        <span aria-hidden="true">·</span>
        <span>Slots live 12 months + grace</span>
      </p>

      {totals && (
        <div className="border-t border-line pt-4 flex items-center justify-between font-mono text-sm">
          <span className="text-muted-soft uppercase text-xs tracking-widest">Total due at checkout</span>
          <span className="font-bold text-ink text-lg">${totals.total.toFixed(0)}</span>
        </div>
      )}

      {blockedNotice && (
        <div role="status" className="p-3 bg-amber-50 border border-amber-300 text-xs text-amber-900">
          {blockedNotice}
        </div>
      )}

      <button
        type="button"
        onClick={buy}
        disabled={busy || !tierRecord || !totals || totals.blocked}
        className="w-full px-4 py-3 bg-ink text-white font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent transition-colors motion-reduce:transition-none disabled:opacity-50"
      >
        {busy ? 'Redirecting…' : `Check out — ${label}`}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-error">{error}</p>}
    </div>
  );
}
