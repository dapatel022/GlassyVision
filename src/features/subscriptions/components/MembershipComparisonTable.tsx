import type { ComparisonColumns } from '@/features/subscriptions/lib/comparison-rows';

/**
 * 12-month cost comparison, Trio basis. Insurance figures are the ONLY
 * non-live numbers on the page — editorial, footnoted, no competitor names.
 * Caller guards `columns === null`.
 */
export default function MembershipComparisonTable({ columns }: { columns: ComparisonColumns }) {
  const cols = [
    columns.alaCarteYear !== null
      ? {
          title: 'Buying à la carte',
          cost: `$${columns.alaCarteYear}`,
          lines: ['3 pairs at full price', 'Any frame, any lenses', 'No commitment'],
          accent: false,
        }
      : null,
    {
      title: 'Typical vision insurance',
      cost: '≈ $216/yr premiums†',
      lines: ['Usually 1 pair/yr via allowance', 'Copays + network limits', 'Renews automatically'],
      accent: false,
    },
    {
      title: 'GlassyVision Trio',
      cost: `$${columns.membershipYear}`,
      lines: ['3 pairs included', 'Any frame, Rx or plano', 'No auto-renew, prorated refunds'],
      accent: true,
    },
  ].filter(Boolean) as Array<{ title: string; cost: string; lines: string[]; accent: boolean }>;

  return (
    <section aria-label="12-month cost comparison">
      <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2">
        12 months, three ways
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line mt-6">
        {cols.map((c) => (
          <div key={c.title} className={`bg-white p-6 ${c.accent ? 'ring-1 ring-accent relative z-10' : ''}`}>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-soft">{c.title}</p>
            <p className={`font-sans text-3xl font-black mt-3 ${c.accent ? 'text-accent' : 'text-ink'}`}>{c.cost}</p>
            <ul className="mt-4 space-y-1.5">
              {c.lines.map((line) => (
                <li key={line} className="font-mono text-[11px] text-muted flex gap-2">
                  <span aria-hidden="true" className={c.accent ? 'text-accent' : 'text-muted-soft'}>—</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="font-serif italic text-[11px] text-muted-soft mt-3">
        †Illustrative, based on typical published US vision-plan rates — not a quote. À-la-carte and
        membership figures are live from our shop.
      </p>
    </section>
  );
}
