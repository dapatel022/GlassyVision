'use client';

import type { BuilderState } from './builder-state';
import type { BuilderData } from '@/features/subscriptions/lib/builder-data';
import { builderTotals } from './builder-totals';

/**
 * Mobile-only sticky footer with the running total, mirroring
 * MembershipStickyCTA's fixed-bottom pattern. Purely a readout — the
 * checkout action itself lives in BuilderReview, so there's exactly one
 * place a purchase can be initiated from.
 *
 * Renders nothing when builderTotals can't resolve a total (no tier, or a
 * pricing outage) — same fail-closed posture as the review step, just
 * silent here instead of showing a notice a second time.
 */
export default function BuilderStickyTotal({ state, data }: { state: BuilderState; data: BuilderData }) {
  const totals = builderTotals(state, data);
  if (!totals) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-ink/95 backdrop-blur border-t border-white/10 px-4 py-3 flex items-center justify-between">
      <div className="font-mono text-white leading-tight">
        <p className="text-[10px] uppercase tracking-widest text-white/60">
          {totals.blocked ? 'Total (partial)' : 'Total'}
        </p>
        <p className="text-lg font-bold">${totals.total.toFixed(0)}</p>
      </div>
      <p className="font-mono text-[11px] text-white/70 text-right">
        ≈ ${totals.perPairAllIn.toFixed(0)} / pair all-in
      </p>
    </div>
  );
}
