import Link from 'next/link';
import Image from 'next/image';
import type { ShopifyCollection } from '@/lib/commerce/types';

interface CategoryTilesProps {
  collections: ShopifyCollection[];
}

export default function CategoryTiles({ collections }: CategoryTilesProps) {
  const tiles = [
    { id: 'virtual-all', handle: 'all', title: 'All Frames', description: 'The complete collection', image: null },
    ...collections.filter((c) => c.handle !== 'all'),
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {tiles.map((c) => (
        <Link
          key={c.id}
          href={`/shop/${c.handle}`}
          className="group relative block aspect-[4/3] border border-line rounded-xl overflow-hidden bg-base-deeper hover:border-accent transition-all"
        >
          {c.image ? (
            <Image
              src={c.image.url}
              alt=""
              aria-hidden="true"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover group-hover:scale-105 transition-transform duration-700"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-soft font-serif italic text-sm">
              GlassyVision
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur border-t border-line p-4">
            <p className="font-sans text-sm font-black uppercase tracking-wider text-ink">{c.title}</p>
            {c.description && (
              <p className="text-xs text-muted-soft mt-0.5 line-clamp-1">{c.description}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
