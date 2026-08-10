'use client';

import { useEffect, useState } from 'react';
import type { BuilderData } from '@/features/subscriptions/lib/builder-data';
import type { MembershipTierPrice } from '@/lib/commerce/membership-pricing';
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';
import { BuilderProvider, useBuilder } from './BuilderContext';
import { TIER_LABELS, type Tier, type TierPairsMap } from './builder-state';
import PairConfigurator from './PairConfigurator';
import BuilderReview from './BuilderReview';
import BuilderStickyTotal from './BuilderStickyTotal';

/**
 * Client shell for the plan-builder route. Carries no business logic of its
 * own beyond the tested reducer in builder-state.ts + the URL/localStorage
 * seeding below — tier resizing, pair round-tripping, and reset all live in
 * builderReducer. Tasks 10 (pair configurator) and 11 (review/checkout)
 * fill in the marked placeholder slots.
 */

const STEPS: Array<{ key: 'plan' | 'pairs' | 'review'; label: string }> = [
  { key: 'plan', label: '01 PLAN' },
  { key: 'pairs', label: '02 PAIRS' },
  { key: 'review', label: '03 REVIEW' },
];

export default function PlanBuilder({ data, initialTier }: { data: BuilderData; initialTier: Tier | null }) {
  // The live tier→pairs entitlement BuilderProvider reconciles hydrated
  // localStorage state against — see reconcileHydratedState. `undefined`
  // when tiers are unavailable, which correctly means "trust no stored
  // tier" (fail closed matches the rest of this page's tiers===null path).
  const tierPairs: TierPairsMap | undefined = data.tiers
    ? data.tiers.reduce<TierPairsMap>((acc, t) => {
        acc[t.tier] = t.pairs;
        return acc;
      }, {})
    : undefined;

  return (
    <BuilderProvider tierPairs={tierPairs}>
      <PlanBuilderShell data={data} initialTier={initialTier} />
    </BuilderProvider>
  );
}

function PlanBuilderShell({ data, initialTier }: { data: BuilderData; initialTier: Tier | null }) {
  const { state, hydrated, setTier, setPair, clearPair } = useBuilder();
  const [activePairIndex, setActivePairIndex] = useState<number | null>(null);

  // Seed the tier from the `?tier=` query param once hydration settles —
  // but only when the persisted builder state hasn't already chosen one. A
  // returning visitor's in-progress plan always wins over the query param.
  useEffect(() => {
    if (!hydrated || state.tier !== null || !initialTier || data.tiers === null) return;
    const match = data.tiers.find((t) => t.tier === initialTier);
    if (match) setTier(initialTier, match.pairs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // The indicator can only distinguish plan vs pairs vs review by proxy —
  // there's no separate "on the review step" piece of state. Simplest
  // correct rule: review lights up once a tier is picked AND no pair is
  // actively being configured (the configurator panel is closed).
  const activeStep: 'plan' | 'pairs' | 'review' =
    state.tier === null ? 'plan' : activePairIndex !== null ? 'pairs' : 'review';

  if (data.tiers === null) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-10">
        <StepIndicator activeStep="plan" />
        <div role="status" className="p-4 bg-amber-50 border border-amber-300 text-sm text-amber-900">
          Membership pricing is temporarily unavailable — please check back shortly.
        </div>
      </div>
    );
  }

  return (
    <div
      className={`max-w-5xl mx-auto px-4 sm:px-6 pt-12 space-y-10 ${
        // BuilderStickyTotal (~65.5px tall, md:hidden) renders whenever a
        // tier is picked — reserve enough bottom padding on mobile for the
        // review step's checkout button to scroll fully clear of it.
        // Desktop never shows the bar, so it keeps the normal py-12 rhythm.
        state.tier ? 'pb-24 md:pb-12' : 'pb-12'
      }`}
    >
      <StepIndicator activeStep={activeStep} />

      <section aria-label="Choose your plan">
        <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2 mb-6">
          01 · Plan
        </h2>
        <TierSelector tiers={data.tiers} selected={state.tier} onSelect={(tier, pairs) => setTier(tier, pairs)} />
      </section>

      {state.tier && (
        <section aria-label="Configure your pairs">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2 mb-6">
            02 · Pairs
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {state.pairs.map((pair, i) => (
              <PairCard
                key={i}
                index={i}
                config={pair}
                isActive={activePairIndex === i}
                onConfigure={() => setActivePairIndex(i)}
                onDecideLater={() => {
                  if (pair !== null) clearPair(i);
                  setActivePairIndex((current) => (current === i ? null : current));
                }}
              />
            ))}
          </div>

          {activePairIndex !== null && (
            <div className="mt-6 border border-line p-6">
              <PairConfigurator
                key={activePairIndex}
                frames={data.frames}
                lensPricing={data.lensPricing}
                surcharge={data.surcharge}
                value={state.pairs[activePairIndex]}
                onDone={(config) => {
                  setPair(activePairIndex, config);
                  setActivePairIndex(null);
                }}
                onCancel={() => setActivePairIndex(null)}
              />
            </div>
          )}
        </section>
      )}

      {state.tier && (
        <section aria-label="Review your plan">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2 mb-6">
            03 · Review
          </h2>
          <BuilderReview state={state} data={data} tier={state.tier} />
        </section>
      )}

      {state.tier && <BuilderStickyTotal state={state} data={data} />}
    </div>
  );
}

function StepIndicator({ activeStep }: { activeStep: 'plan' | 'pairs' | 'review' }) {
  return (
    <nav aria-label="Plan builder steps" className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-widest">
      {STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-3">
          <span
            aria-current={step.key === activeStep ? 'step' : undefined}
            className={step.key === activeStep ? 'text-ink' : 'text-muted-soft'}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && <span aria-hidden="true" className="text-line">/</span>}
        </div>
      ))}
    </nav>
  );
}

function TierSelector({
  tiers,
  selected,
  onSelect,
}: {
  tiers: MembershipTierPrice[];
  selected: Tier | null;
  onSelect: (tier: Tier, pairs: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line">
      {tiers.map((t) => {
        const label = TIER_LABELS[t.tier];
        const isSelected = selected === t.tier;
        return (
          <button
            key={t.sku}
            type="button"
            onClick={() => onSelect(t.tier, t.pairs)}
            aria-pressed={isSelected}
            className={`relative bg-white p-6 flex flex-col gap-4 text-left transition-colors motion-reduce:transition-none ${
              isSelected ? 'ring-1 ring-accent z-10' : 'hover:bg-base'
            }`}
          >
            <span className="font-mono text-[10px] font-bold tracking-widest px-2 py-1 border border-line text-ink self-start">
              GV-{label.toUpperCase()}
            </span>
            <div>
              <p className="font-sans text-5xl font-black text-ink leading-none">
                {t.pairs}
                <span className="text-xl align-top">×</span>
              </p>
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-soft mt-1">
                {t.pairs === 1 ? 'pair' : 'pairs'} / year
              </p>
            </div>
            <div className="border-t border-line pt-4">
              <p className="font-mono text-xl font-bold text-ink">
                ${t.perPair.toFixed(0)} <span className="text-xs text-muted-soft">/ PAIR</span>
              </p>
              <p className="font-mono text-xs text-muted mt-0.5">
                ${t.price.toFixed(0)} {t.currencyCode} billed once a year
              </p>
            </div>
            <span className="mt-auto font-sans font-bold text-xs uppercase tracking-widest text-accent">
              {isSelected ? 'Selected' : 'Select this plan →'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PairCard({
  index,
  config,
  isActive,
  onConfigure,
  onDecideLater,
}: {
  index: number;
  config: PairConfig | null;
  isActive: boolean;
  onConfigure: () => void;
  onDecideLater: () => void;
}) {
  return (
    <div className={`border p-4 flex flex-col gap-3 ${isActive ? 'border-accent ring-1 ring-accent' : 'border-line'}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold tracking-widest text-muted-soft">PAIR {index + 1}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-soft">
          {config ? 'Configured' : 'Not configured'}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfigure}
          className="px-3 py-2 bg-ink text-white font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent transition-colors motion-reduce:transition-none"
        >
          Configure this pair
        </button>
        <button
          type="button"
          onClick={onDecideLater}
          className="px-3 py-2 border border-line text-ink font-sans font-bold text-xs uppercase tracking-widest hover:border-accent transition-colors motion-reduce:transition-none"
        >
          Decide later — redeem anytime this year
        </button>
      </div>
    </div>
  );
}
