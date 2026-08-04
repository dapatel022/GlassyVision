import Link from 'next/link';
import Image from 'next/image';
import type { ShopifyCollection } from '@/lib/commerce/types';

interface CategoryTilesProps {
  collections: ShopifyCollection[];
}

// Catalog taxonomy codes — real classification, styled like a lab index.
// Fallback: first three letters of the handle.
const TAXONOMY_CODES: Record<string, string> = {
  all: 'ALL',
  sunglasses: 'SUN',
  optical: 'OPT',
  'new-arrivals': 'NEW',
  bestsellers: 'BST',
  mens: 'MEN',
  womens: 'WMN',
  titanium: 'TI', // element symbol
  acetate: 'ACE',
  polarized: 'POL',
};

function taxonomyCode(handle: string): string {
  return TAXONOMY_CODES[handle] ?? handle.slice(0, 3).toUpperCase();
}

export default function CategoryTiles({ collections }: CategoryTilesProps) {
  const all = collections.find((c) => c.handle === 'all');
  const rest = collections.filter((c) => c.handle !== 'all');
  const tiles = [
    all ?? { id: 'virtual-all', handle: 'all', title: 'All Frames', description: 'The complete collection', image: null },
    ...rest,
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line">
      {tiles.map((c, i) => (
        <Link
          key={c.id}
          href={`/shop/${c.handle}`}
          className={`group relative block overflow-hidden bg-base-deeper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-10 ${
            i === 0 ? 'sm:col-span-2 aspect-[4/3] sm:aspect-[8/3]' : 'aspect-[4/3]'
          }`}
        >
          {c.image ? (
            <Image
              src={c.image.url}
              alt=""
              aria-hidden="true"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover grayscale-[25%] group-hover:grayscale-0 group-hover:scale-[1.02] transition-all duration-700 motion-reduce:transition-none motion-reduce:transform-none"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-soft font-mono text-xs uppercase tracking-widest">
              No image on file
            </div>
          )}

          {/* Taxonomy code chip — the tile's index entry */}
          <span className="absolute top-3 left-3 bg-white text-ink font-mono text-[10px] font-bold tracking-widest px-2 py-1 border border-line group-hover:bg-accent group-hover:text-white group-hover:border-accent transition-colors">
            GV-{taxonomyCode(c.handle)}
          </span>

          {/* Hover affordance */}
          <span
            aria-hidden="true"
            className="absolute top-3 right-3 font-mono text-sm text-white opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all motion-reduce:transition-none mix-blend-difference"
          >
            →
          </span>

          <div className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur border-t border-line px-4 py-3 flex items-baseline justify-between gap-3">
            <p className="font-sans text-sm font-black uppercase tracking-wider text-ink">{c.title}</p>
            {c.description && (
              <p className="font-mono text-[11px] text-muted-soft line-clamp-1 text-right">{c.description}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
