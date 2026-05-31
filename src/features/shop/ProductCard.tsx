import Link from 'next/link';
import Image from 'next/image';
import type { ShopifyProduct } from '@/lib/commerce/types';

interface ProductCardProps {
  product: ShopifyProduct;
}

export default function ProductCard({ product }: ProductCardProps) {
  const image = product.images[0];
  const price = Number(product.price).toFixed(0);
  const isRxCapable = product.metafields?.find(
    (m) => m.namespace === 'custom' && m.key === 'is_rx_capable'
  )?.value === 'true';

  return (
    <Link
      href={`/p/${product.handle}`}
      className="group block border border-line rounded-xl overflow-hidden bg-white hover:border-accent hover:shadow-sm transition-all"
    >
      <div className="aspect-square bg-base-deeper flex items-center justify-center overflow-hidden relative">
        {image ? (
          <Image
            src={image.url}
            alt={image.altText || product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="text-muted-soft font-serif italic text-sm">No image</div>
        )}

        {isRxCapable && (
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur border border-line rounded px-2 py-0.5 shadow-sm">
            <span className="font-mono text-[8px] font-bold text-accent uppercase tracking-wider">
              Rx Capable
            </span>
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
          <span className="text-[9px] text-muted-soft font-serif italic">
            frame only
          </span>
        </div>
      </div>
    </Link>
  );
}
