import Link from 'next/link';
import Image from 'next/image';
import type { ShopifyProduct } from '@/lib/commerce/types';
import { deriveBadges, deriveSwatches } from '@/features/shop/catalog/card-data';

interface ProductCardProps {
  product: ShopifyProduct;
}

const MAX_BADGES = 2;
const MAX_SWATCHES = 4;

export default function ProductCard({ product }: ProductCardProps) {
  const image = product.images[0];
  const hoverImage = product.images[1];
  const price = Number(product.price).toFixed(0);
  const badges = deriveBadges(product).slice(0, MAX_BADGES);
  const swatches = deriveSwatches(product);
  const shownSwatches = swatches.slice(0, MAX_SWATCHES);
  const extraSwatches = swatches.length - shownSwatches.length;

  return (
    <Link
      href={`/p/${product.handle}`}
      className="group block border border-line rounded-xl overflow-hidden bg-white hover:border-accent hover:shadow-sm transition-all"
    >
      <div className="aspect-square bg-base-deeper flex items-center justify-center overflow-hidden relative">
        {image ? (
          <>
            <Image
              src={image.url}
              alt={image.altText || product.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={`object-cover transition-all duration-700 ${
                hoverImage ? 'group-hover:opacity-0' : 'group-hover:scale-105'
              }`}
            />
            {hoverImage && (
              <Image
                src={hoverImage.url}
                alt=""
                aria-hidden="true"
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
              />
            )}
          </>
        ) : (
          <div className="text-muted-soft font-serif italic text-sm">No image</div>
        )}

        {badges.length > 0 && (
          <div className="absolute bottom-3 left-3 flex gap-1.5">
            {badges.map((b) => (
              <span
                key={b.id}
                className="bg-white/90 backdrop-blur border border-line rounded px-2 py-0.5 shadow-sm font-mono text-[8px] font-bold text-accent uppercase tracking-wider"
              >
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col justify-between">
        <p className="font-sans text-xs font-bold text-ink uppercase tracking-wider truncate">
          {product.title}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-muted font-mono font-bold">
            ${price} {product.currencyCode}
          </p>
          <span className="text-[9px] text-muted-soft font-serif italic">frame only</span>
        </div>
        {shownSwatches.length > 0 && (
          <ul className="mt-2 flex items-center gap-1.5" aria-label="Available colors">
            {shownSwatches.map((s) => (
              <li
                key={s.name}
                title={s.name}
                className="w-3 h-3 rounded-full border border-line"
                style={{ backgroundColor: s.hex }}
              >
                <span className="sr-only">{s.name}</span>
              </li>
            ))}
            {extraSwatches > 0 && (
              <li className="text-[9px] text-muted-soft font-mono">+{extraSwatches}</li>
            )}
          </ul>
        )}
      </div>
    </Link>
  );
}
