import Link from 'next/link';
import type { ShopifyProduct } from '@/lib/commerce/types';

interface ProductCardProps {
  product: ShopifyProduct;
}

export default function ProductCard({ product }: ProductCardProps) {
  const image = product.images[0];
  const price = Number(product.price).toFixed(0);

  return (
    <Link
      href={`/p/${product.handle}`}
      className="group block border border-line rounded-xl overflow-hidden bg-white hover:border-accent transition-colors"
    >
      <div className="aspect-square bg-base-deeper flex items-center justify-center overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.altText || product.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="text-muted-soft font-serif italic text-sm">No image</div>
        )}
      </div>
      <div className="p-4">
        <p className="font-sans text-sm font-bold text-ink uppercase tracking-wide truncate">{product.title}</p>
        <p className="text-sm text-muted mt-1 font-mono">
          ${price} {product.currencyCode}
        </p>
      </div>
    </Link>
  );
}
