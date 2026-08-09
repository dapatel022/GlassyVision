'use client';

import { useState } from 'react';
import type { MembershipMath } from '@/lib/commerce/membership-math-core';

const TIER_LABELS: Record<string, string> = { solo: 'Solo', duo: 'Duo', trio: 'Trio' };

/**
 * Live per-pair vs à-la-carte math. Caller guards `math === null` (fail
 * closed) — this component always has real numbers.
 */
export default function MembershipSavingsCalculator({ math }: { math: MembershipMath }) {
  const [tierKey, setTierKey] = useState<'solo' | 'duo' | 'trio'>('duo');
  const tier = math.tiers.find((t) => t.tier === tierKey) ?? math.tiers[0];
  const showSavings = tier.savings > 0; // honest: never render a non-saving as a saving

  return (
    <section aria-label="Savings calculator" className="bg-white border border-line rounded-3xl p-8 shadow-sm">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-accent">
        Do the math
      </p>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mt-4">
        <div>
          <div role="group" aria-label="Pairs per year" className="inline-flex border border-line rounded-full overflow-hidden">
            {math.tiers.map((t) => (
              <button
                key={t.tier}
                onClick={() => setTierKey(t.tier)}
                aria-pressed={t.tier === tierKey}
                className={`px-5 py-2 font-mono text-sm font-bold transition-colors motion-reduce:transition-none ${
                  t.tier === tierKey ? 'bg-ink text-white' : 'bg-white text-muted hover:text-ink'
                }`}
              >
                {t.pairs}×
              </button>
            ))}
          </div>
          <p className="font-sans text-6xl font-black text-ink mt-6 leading-none">
            ${tier.perPair}
            <span className="text-xl align-top text-muted-soft font-mono">/PAIR</span>
          </p>
          <p className="font-mono text-xs text-muted mt-2">
            {TIER_LABELS[tier.tier]} — ${tier.yearly} {tier.currencyCode} once a year, {tier.pairs}{' '}
            {tier.pairs === 1 ? 'pair' : 'pairs'}
          </p>
        </div>
        <div className="md:text-right md:max-w-xs w-full">
          <p className="font-mono text-xs text-muted-soft line-through">
            ${tier.alaCarteYear} buying {tier.pairs} {tier.pairs === 1 ? 'pair' : 'pairs'} à la carte*
          </p>
          {showSavings && (
            <>
              <p className="font-sans text-2xl font-black text-accent mt-1">
                You keep ${tier.savings}
              </p>
              <div className="h-1.5 bg-base-deeper rounded-full mt-3 overflow-hidden" aria-hidden="true">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500 motion-reduce:transition-none"
                  style={{ width: `${Math.min(tier.savingsPct, 100)}%` }}
                />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-soft mt-2">
                {tier.savingsPct}% below à-la-carte
              </p>
            </>
          )}
        </div>
      </div>
      <p className="font-serif italic text-[11px] text-muted-soft mt-6">
        *À-la-carte figure = today&apos;s median catalog frame price (${math.representativeFramePrice}) × pairs.
        Live from our shop — not a made-up anchor.
      </p>
    </section>
  );
}
