import type { MembershipPricing } from '@/lib/commerce/membership-pricing';
import MembershipCTA from './MembershipCTA';

const TIER_LABELS: Record<string, string> = { solo: 'Solo', duo: 'Duo', trio: 'Trio' };

const SPEC_LINES = [
  'Any frame in the catalog',
  'Rx or plano lenses',
  'Upgrades priced at redemption',
  'Ships US + Canada',
];

export default function MembershipTierTable({ pricing, canBuy }: { pricing: MembershipPricing; canBuy: boolean }) {
  if (pricing === null) {
    return (
      <div role="status" className="p-4 bg-amber-50 border border-amber-300 text-sm text-amber-900">
        Membership pricing is temporarily unavailable — please check back shortly.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line">
      {pricing.map((t) => {
        const label = TIER_LABELS[t.tier];
        const anchor = t.tier === 'duo';
        return (
          <div key={t.sku} className={`relative bg-white p-6 flex flex-col gap-4 ${anchor ? 'ring-1 ring-accent z-10' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold tracking-widest px-2 py-1 border border-line text-ink">
                GV-{label.toUpperCase()}
              </span>
              {anchor && (
                <span className="font-mono text-[10px] font-bold tracking-widest px-2 py-1 bg-accent text-white">
                  MOST CHOSEN
                </span>
              )}
            </div>

            <div>
              <p className="font-sans text-6xl font-black text-ink leading-none">
                {t.pairs}<span className="text-2xl align-top">×</span>
              </p>
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-soft mt-1">
                {t.pairs === 1 ? 'pair' : 'pairs'} / year
              </p>
            </div>

            <div className="border-t border-line pt-4">
              <p className="font-mono text-2xl font-bold text-ink">${t.perPair.toFixed(0)} <span className="text-xs text-muted-soft">/ PAIR</span></p>
              <p className="font-mono text-xs text-muted mt-0.5">${t.price.toFixed(0)} {t.currencyCode} billed once a year</p>
            </div>

            <ul className="border-t border-line pt-4 space-y-1.5 flex-1">
              {SPEC_LINES.map((line) => (
                <li key={line} className="font-mono text-[11px] text-muted flex gap-2">
                  <span aria-hidden="true" className="text-accent">—</span>{line}
                </li>
              ))}
            </ul>

            {canBuy && <MembershipCTA tier={t} label={label} />}
          </div>
        );
      })}
    </div>
  );
}
