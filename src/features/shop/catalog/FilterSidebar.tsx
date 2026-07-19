'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { CatalogFacet } from '@/lib/commerce/types';
import { toggleFilterParam, setSingleParam } from '@/lib/commerce/catalog-filters';

interface FilterSidebarProps {
  facets: CatalogFacet[];
}

function PriceControl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('price') ?? '';
  const [initMin, initMax] = current.split('-');
  const [min, setMin] = useState(initMin ?? '');
  const [max, setMax] = useState(initMax ?? '');

  function apply() {
    const value = min === '' && max === '' ? null : `${min}-${max}`;
    router.push(`${pathname}?${setSingleParam(searchParams.toString(), 'price', value)}`, { scroll: false });
  }

  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-soft">
        Min $
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="w-20 border border-line rounded-lg px-2 py-1.5 text-xs text-ink bg-white"
        />
      </label>
      <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-soft">
        Max $
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="w-20 border border-line rounded-lg px-2 py-1.5 text-xs text-ink bg-white"
        />
      </label>
      <button
        type="button"
        onClick={apply}
        className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent border border-accent rounded-lg px-3 py-1.5 hover:bg-accent/5 transition-colors"
      >
        Apply
      </button>
    </div>
  );
}

export default function FilterSidebar({ facets }: FilterSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  if (facets.length === 0) return null;

  return (
    <div className="space-y-2">
      {facets.map((facet) => {
        if (facet.type === 'PRICE_RANGE') {
          return (
            <details key={facet.id} open className="border-b border-line pb-4 pt-2">
              <summary className="cursor-pointer list-none font-mono text-[11px] font-bold uppercase tracking-widest text-ink py-2">
                {facet.label}
              </summary>
              <div className="pt-2">
                <PriceControl />
              </div>
            </details>
          );
        }

        const renderable = facet.values.filter((v) => v.param !== null);
        if (renderable.length === 0) return null;

        return (
          <details key={facet.id} open className="border-b border-line pb-4 pt-2">
            <summary className="cursor-pointer list-none font-mono text-[11px] font-bold uppercase tracking-widest text-ink py-2">
              {facet.label}
            </summary>
            <ul className="pt-1 space-y-1.5">
              {renderable.map((v) => {
                const { key, value } = v.param!;
                const active = searchParams.getAll(key).includes(value);
                return (
                  <li key={v.id}>
                    <label className="flex items-center gap-2 text-xs text-muted cursor-pointer hover:text-ink transition-colors">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() =>
                          router.push(`${pathname}?${toggleFilterParam(qs, key, value)}`, { scroll: false })
                        }
                        className="h-3.5 w-3.5 rounded border-line accent-current"
                      />
                      <span className={active ? 'font-bold text-ink' : ''}>{v.label}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-soft">{v.count}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
