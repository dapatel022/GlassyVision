import type { ShopifyProduct } from '@/lib/commerce/types';
import type { SiteBanner } from '@/lib/commerce/content';
import ProductCard from '@/features/shop/ProductCard';
import PromoTile from '@/features/shop/catalog/PromoTile';

interface ProductGridProps {
  products: ShopifyProduct[];
  /** Optional promo tile spliced into the grid (first page only — caller decides). */
  promo?: SiteBanner;
  promoIndex?: number;
}

export default function ProductGrid({ products, promo, promoIndex = 6 }: ProductGridProps) {
  const cards = products.map((p) => <ProductCard key={p.id} product={p} />);
  if (promo) {
    cards.splice(Math.min(promoIndex, cards.length), 0, <PromoTile key="promo-tile" banner={promo} />);
  }
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-6 animate-fade-in-up">{cards}</div>;
}
