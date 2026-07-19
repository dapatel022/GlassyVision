'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SORT_OPTIONS, setSingleParam } from '@/lib/commerce/catalog-filters';

export default function SortDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('sort') ?? 'featured';

  return (
    <label className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-soft">
      Sort
      <select
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          router.push(
            `${pathname}?${setSingleParam(searchParams.toString(), 'sort', v === 'featured' ? null : v)}`,
            { scroll: false },
          );
        }}
        className="border border-line rounded-lg bg-white px-2 py-1.5 text-xs text-ink font-sans normal-case tracking-normal"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
