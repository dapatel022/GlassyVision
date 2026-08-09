import type { UpgradeRow } from '@/features/subscriptions/lib/upgrade-rows';

const INCLUDED = [
  'Any active-collection frame (acetate or titanium)',
  'Standard single-vision Rx lenses',
  'Non-Rx plano & blue-light protection',
  'Hardfold case & microfiber cloth',
];

/** Live upgrade prices; a null price renders "at redemption" — never a stale number. */
export default function MembershipUpgrades({ rows }: { rows: UpgradeRow[] }) {
  return (
    <section aria-label="Included versus optional upgrades" className="bg-white border border-line rounded-3xl p-8 shadow-sm">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-accent">
        Fair &amp; transparent
      </p>
      <h2 className="font-sans text-xl font-black uppercase text-ink tracking-tight mt-1">
        Included vs optional upgrades
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
        <div className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-accent">✓ Included in every pair</p>
          <ul className="space-y-2 font-serif italic text-xs text-ink/80 divide-y divide-line/60">
            {INCLUDED.map((item) => (
              <li key={item} className="pt-2 flex justify-between gap-4">
                <span>{item}</span>
                <strong className="font-mono not-italic text-ink shrink-0">COVERED</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-muted-soft">
            + Optional upgrades — priced at redemption, same as the shop
          </p>
          <ul className="space-y-2 font-mono text-xs text-ink divide-y divide-line/60">
            {rows.map((r) => (
              <li key={r.label} className="pt-2 flex justify-between gap-4">
                <span>{r.label}</span>
                <strong className="text-accent shrink-0">
                  {r.price !== null ? `+$${r.price} ${r.currencyCode}` : 'at redemption'}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
