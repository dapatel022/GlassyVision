import type { ShopifyProduct } from '@/lib/commerce/types';
import ProductCard from '@/features/shop/ProductCard';

interface ProductGridProps {
  products: ShopifyProduct[];
}

export default function ProductGrid({ products }: ProductGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 animate-fade-in-up">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
