'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import type { BuilderFrame } from '@/features/subscriptions/lib/builder-data';
import type { LensPricingMap } from '@/lib/commerce/lens-pricing';
import type { FrameSurchargePrice } from '@/lib/commerce/frame-surcharge-pricing';
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';
import { pairAddonTotal } from './pair-pricing';

/**
 * Per-pair configurator: frame -> lenses -> summary. Pair-style mechanics
 * (numbered sub-steps, an "included in your plan" group vs. a priced group)
 * rendered in this app's own editorial tokens.
 *
 * Two correctness rules this component exists to enforce (both are
 * post-payment failure modes if the UI gets them wrong — see
 * auto-redeem-pairs.ts and /checkout):
 *  1. A non-Rx-capable frame makes single-vision/progressive unselectable.
 *  2. Any chargeable option missing from `lensPricing` is disabled, and a
 *     premium frame is unselectable while `surcharge` is null. This
 *     component never renders a price it doesn't have.
 */

type SubStep = 'frame' | 'lenses' | 'summary';
type FrameFilter = 'all' | 'included' | 'premium';

interface PairConfiguratorProps {
  frames: BuilderFrame[];
  lensPricing: LensPricingMap | null;
  surcharge: FrameSurchargePrice | null;
  value: PairConfig | null;
  onDone: (config: PairConfig) => void;
  onCancel: () => void;
}

const SUB_STEPS: Array<{ key: SubStep; label: string }> = [
  { key: 'frame', label: '1 · Frame' },
  { key: 'lenses', label: '2 · Lenses' },
  { key: 'summary', label: '3 · Summary' },
];

const TINTS: Array<{ id: 'grey' | 'amber' | 'green'; label: string; note: string }> = [
  { id: 'grey', label: 'Grey', note: 'Classic true-color sun tint.' },
  { id: 'amber', label: 'Amber', note: 'High-contrast — drives like sunglasses.' },
  { id: 'green', label: 'Green', note: 'Balanced glare cut for all-day wear.' },
];

const LENS_TYPE_LABELS: Record<PairConfig['l'], string> = {
  non_rx: 'Non-Rx',
  single_vision: 'Single Vision',
  progressive: 'Progressive',
};

const TINT_LABELS: Record<PairConfig['t'], string> = { none: 'Clear', grey: 'Grey', amber: 'Amber', green: 'Green' };

export default function PairConfigurator({ frames, lensPricing, surcharge, value, onDone, onCancel }: PairConfiguratorProps) {
  const initialFrame = useMemo(
    () => (value ? frames.find((f) => f.handle === value.h) ?? null : null),
    [frames, value],
  );

  const [subStep, setSubStep] = useState<SubStep>('frame');
  const [frame, setFrame] = useState<BuilderFrame | null>(initialFrame);
  // Default per brief: single-vision, nothing paid. Sanitized against
  // initialFrame here too — a stored config for a frame that has since lost
  // Rx capability must not resurrect an Rx lens type on mount (mirrors the
  // same guard selectFrame applies on a live frame swap).
  const [lensType, setLensType] = useState<PairConfig['l']>(() => {
    const l = value?.l ?? 'single_vision';
    return initialFrame && !initialFrame.rxCapable && l !== 'non_rx' ? 'non_rx' : l;
  });
  const [photochromic, setPhotochromic] = useState(value?.u.includes('photochromic') ?? false);
  const [tint, setTint] = useState<PairConfig['t']>(value?.t ?? 'none');
  const [blueLight, setBlueLight] = useState(value?.b ?? false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FrameFilter>('all');

  const filteredFrames = frames.filter((f) => {
    if (filter === 'included' && f.premium) return false;
    if (filter === 'premium' && !f.premium) return false;
    const q = search.trim().toLowerCase();
    if (q && !f.title.toLowerCase().includes(q)) return false;
    return true;
  });

  function priceFor(optionId: string): number | null {
    return lensPricing?.[optionId]?.price ?? null;
  }

  function selectFrame(f: BuilderFrame) {
    setFrame(f);
    // Rule 1: a non-Rx-capable frame can never carry an Rx lens type —
    // force back to non_rx rather than leaving a config auto-redeem-pairs
    // would fail closed on after payment.
    if (!f.rxCapable && lensType !== 'non_rx') setLensType('non_rx');
  }

  function selectLensType(t: PairConfig['l']) {
    if (t !== 'non_rx' && frame && !frame.rxCapable) return;
    if (t === 'progressive' && priceFor('progressive') === null) return;
    setLensType(t);
  }

  // u derives automatically from lensType so the codec invariant
  // (l === 'progressive' <=> u includes 'progressive') always holds — there
  // is no separate "progressive upgrade" toggle for the user to desync.
  const upgrades = [...(lensType === 'progressive' ? ['progressive'] : []), ...(photochromic ? ['photochromic'] : [])];

  const draftConfig: PairConfig | null = frame
    ? { v: frame.variantId, h: frame.handle, l: lensType, u: upgrades, t: tint, ...(blueLight ? { b: true as const } : {}) }
    : null;

  const addonTotal = draftConfig && frame ? pairAddonTotal(draftConfig, frame.premium, lensPricing, surcharge) : null;

  const showRxNote = lensType === 'single_vision' || lensType === 'progressive';

  function handleDone() {
    if (!draftConfig || addonTotal === null) return;
    onDone(draftConfig);
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Pair configurator steps" className="flex items-center gap-4 font-mono text-[11px] font-bold uppercase tracking-widest border-b border-line pb-3">
        {SUB_STEPS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-current={subStep === s.key ? 'step' : undefined}
            disabled={s.key !== 'frame' && !frame}
            onClick={() => setSubStep(s.key)}
            className={`pb-1 transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed ${
              subStep === s.key ? 'text-ink border-b border-accent' : 'text-muted-soft hover:text-ink'
            }`}
          >
            {s.label}
          </button>
        ))}
        <button type="button" onClick={onCancel} className="ml-auto font-mono text-[11px] font-bold uppercase tracking-widest text-muted-soft hover:text-ink">
          Cancel
        </button>
      </nav>

      {subStep === 'frame' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search frames…"
              aria-label="Search frames"
              className="flex-1 border border-line bg-white px-3 py-2 font-sans text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex gap-2 font-mono text-[10px] font-bold uppercase tracking-widest">
              {(['all', 'included', 'premium'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 border transition-colors motion-reduce:transition-none ${
                    filter === f ? 'border-accent text-accent' : 'border-line text-muted-soft hover:text-ink'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {surcharge === null && filteredFrames.some((f) => f.premium) && (
            <div role="status" className="p-3 bg-amber-50 border border-amber-300 text-xs text-amber-900">
              Premium frame pricing is temporarily unavailable — premium frames are shown but can&apos;t be selected right now.
            </div>
          )}

          {filteredFrames.length === 0 ? (
            <p className="text-sm text-muted-soft py-8 text-center">No frames match your search.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredFrames.map((f) => {
                const disabled = f.premium && surcharge === null;
                const selected = frame?.handle === f.handle;
                return (
                  <button
                    key={f.handle}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => selectFrame(f)}
                    className={`text-left border p-3 flex flex-col gap-2 transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed ${
                      selected ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent'
                    }`}
                  >
                    <div className="aspect-square bg-base-deeper flex items-center justify-center overflow-hidden relative">
                      {f.image ? (
                        <Image
                          src={f.image}
                          alt={f.title}
                          fill
                          sizes="(max-width: 640px) 33vw, 200px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="font-mono text-[10px] text-muted-soft uppercase">No image</span>
                      )}
                    </div>
                    <span className="font-sans text-xs font-bold text-ink leading-tight">{f.title}</span>
                    {f.premium && (
                      <span className="self-start font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border border-tortoise text-tortoise">
                        Premium {surcharge ? `+$${surcharge.price.toFixed(0)}` : '· temporarily unavailable'}
                      </span>
                    )}
                    {!f.rxCapable && (
                      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-soft">Non-Rx demo lenses only</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!frame}
              onClick={() => setSubStep('lenses')}
              className="px-4 py-2 bg-ink text-white font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next: Lenses →
            </button>
          </div>
        </div>
      )}

      {subStep === 'lenses' && frame && (
        <div className="space-y-6">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-soft mb-2">Included in your plan</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <LensOption
                label="Non-Rx"
                note="Clear demo lenses. No prescription."
                selected={lensType === 'non_rx'}
                onClick={() => selectLensType('non_rx')}
              />
              <LensOption
                label="Single Vision"
                note={frame.rxCapable ? 'Standard prescription lenses.' : 'Not available — non-Rx demo lenses only on this frame.'}
                selected={lensType === 'single_vision'}
                disabled={!frame.rxCapable}
                onClick={() => selectLensType('single_vision')}
              />
              <LensOption
                label="Blue Light"
                note="Screen filter coating. Toggle on any lens type."
                selected={blueLight}
                onClick={() => setBlueLight((v) => !v)}
                chip="FOR SCREENS"
              />
            </div>
          </div>

          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-soft mb-2">Paid upgrades</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <LensOption
                label="Progressive"
                note={
                  !frame.rxCapable
                    ? 'Not available — non-Rx demo lenses only on this frame.'
                    : priceFor('progressive') === null
                      ? 'Temporarily unavailable.'
                      : 'No-line lens for near and far.'
                }
                selected={lensType === 'progressive'}
                disabled={!frame.rxCapable || priceFor('progressive') === null}
                onClick={() => selectLensType('progressive')}
                price={priceFor('progressive')}
              />
              <LensOption
                label="Photochromic"
                note={priceFor('photochromic') === null ? 'Temporarily unavailable.' : 'Darkens in sunlight, clears indoors.'}
                selected={photochromic}
                // A self-toggle (no separate "off" control), so it must stay
                // clickable while already on even if pricing later drops —
                // otherwise a disabled button can never be turned back off.
                disabled={priceFor('photochromic') === null && !photochromic}
                onClick={() => setPhotochromic((v) => !v)}
                price={priceFor('photochromic')}
                chip="DRIVES LIKE SUNGLASSES"
              />
            </div>
          </div>

          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-soft mb-2">Tint</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <LensOption label="Clear" note="No tint." selected={tint === 'none'} onClick={() => setTint('none')} />
              {TINTS.map((t) => (
                <LensOption
                  key={t.id}
                  label={t.label}
                  note={priceFor(t.id) === null ? 'Temporarily unavailable.' : t.note}
                  selected={tint === t.id}
                  disabled={priceFor(t.id) === null}
                  onClick={() => setTint(t.id)}
                  price={priceFor(t.id)}
                />
              ))}
            </div>
          </div>

          {showRxNote && (
            <p className="text-xs text-muted-soft border border-line p-3">
              you&apos;ll upload your prescription after checkout — takes a minute.
            </p>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setSubStep('frame')}
              className="px-4 py-2 border border-line text-ink font-sans font-bold text-xs uppercase tracking-widest hover:border-accent transition-colors motion-reduce:transition-none"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setSubStep('summary')}
              className="px-4 py-2 bg-ink text-white font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent transition-colors motion-reduce:transition-none"
            >
              Next: Summary →
            </button>
          </div>
        </div>
      )}

      {subStep === 'summary' && frame && draftConfig && (
        <div className="space-y-6">
          <div className="border border-line p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-sans text-sm font-bold text-ink">{frame.title}</span>
              {frame.premium && (
                <span className="font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border border-tortoise text-tortoise">
                  Premium
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-y-1 font-mono text-xs text-muted">
              <dt className="text-muted-soft">Lens</dt>
              <dd className="text-ink text-right">{LENS_TYPE_LABELS[draftConfig.l]}</dd>
              <dt className="text-muted-soft">Tint</dt>
              <dd className="text-ink text-right">{TINT_LABELS[draftConfig.t]}</dd>
              <dt className="text-muted-soft">Blue light</dt>
              <dd className="text-ink text-right">{draftConfig.b ? 'Yes' : 'No'}</dd>
              <dt className="text-muted-soft">Photochromic</dt>
              <dd className="text-ink text-right">{photochromic ? 'Yes' : 'No'}</dd>
            </dl>
            <div className="border-t border-line pt-2 flex items-center justify-between font-mono text-sm">
              <span className="text-muted-soft uppercase text-xs tracking-widest">Due at checkout for this pair</span>
              <span className="font-bold text-ink">{addonTotal === null ? 'Unavailable' : `+$${addonTotal.toFixed(0)}`}</span>
            </div>
          </div>

          {addonTotal === null && (
            <div role="status" className="p-3 bg-amber-50 border border-amber-300 text-xs text-amber-900">
              Part of this pair can&apos;t be priced right now — adjust your selections or try again shortly.
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setSubStep('lenses')}
              className="px-4 py-2 border border-line text-ink font-sans font-bold text-xs uppercase tracking-widest hover:border-accent transition-colors motion-reduce:transition-none"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={addonTotal === null}
              onClick={handleDone}
              className="px-4 py-2 bg-ink text-white font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save this pair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LensOption({
  label,
  note,
  selected,
  disabled,
  onClick,
  price,
  chip,
}: {
  label: string;
  note: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  price?: number | null;
  chip?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`text-left border p-3 flex flex-col gap-1 transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-xs font-bold text-ink uppercase tracking-wide">{label}</span>
        {typeof price === 'number' && price > 0 && (
          <span className="font-mono text-[10px] font-bold text-ink">+${price.toFixed(0)}</span>
        )}
      </div>
      {chip && (
        <span className="self-start font-mono text-[9px] font-bold uppercase tracking-widest text-accent">{chip}</span>
      )}
      <p className="font-mono text-[10px] text-muted-soft leading-snug">{note}</p>
    </button>
  );
}
