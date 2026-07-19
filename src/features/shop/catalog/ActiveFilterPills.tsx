'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { activeFilterEntries, setSingleParam, toggleFilterParam } from '@/lib/commerce/catalog-filters';

interface ActiveFilterPillsProps {
  resultCount: number;
  hasNextPage: boolean;
}

/** "m.custom.frame_shape" -> "Frame shape", "opt.size" -> "Size", "vendor" -> "Brand" */
function labelForKey(key: string): string {
  if (key === 'vendor') return 'Brand';
  if (key === 'ptype') return 'Type';
  if (key === 'tag') return 'Tag';
  if (key === 'available') return 'In stock';
  if (key === 'price') return 'Price';
  const raw = key.startsWith('opt.') ? key.slice(4) : key.startsWith('m.') ? key.split('.').slice(2).join('.') : key;
  const words = raw.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function ActiveFilterPills({ resultCount, hasNextPage }: ActiveFilterPillsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const entries = activeFilterEntries(qs);

  function removeEntry(key: string, value: string) {
    const next = key === 'price' ? setSingleParam(qs, 'price', null) : toggleFilterParam(qs, key, value);
    router.push(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 min-h-8">
      {entries.map(({ key, value }) => (
        <button
          key={`${key}=${value}`}
          type="button"
          onClick={() => removeEntry(key, value)}
          className="inline-flex items-center gap-1.5 border border-line rounded-full bg-white px-3 py-1 text-[11px] text-ink hover:border-accent transition-colors"
        >
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-soft">{labelForKey(key)}:</span>
          {value}
          <span aria-hidden="true">×</span>
          <span className="sr-only">Remove filter {labelForKey(key)} {value}</span>
        </button>
      ))}
      {entries.length > 0 && (
        <button
          type="button"
          onClick={() => router.push(pathname, { scroll: false })}
          className="text-[11px] font-mono font-bold uppercase tracking-wider text-accent hover:underline"
        >
          Clear all
        </button>
      )}
      <span className="ml-auto text-xs text-muted-soft font-serif italic">
        Showing {resultCount}
        {hasNextPage ? '+' : ''} models
      </span>
    </div>
  );
}
