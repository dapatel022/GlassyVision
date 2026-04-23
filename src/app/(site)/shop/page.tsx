import Link from 'next/link';
import { getProducts } from '@/lib/commerce/shopify';
import ProductCard from '@/features/shop/ProductCard';

export const revalidate = 900;

export const metadata = {
  title: 'Shop',
  description: 'All GlassyVision frames, hand-finished in India.',
};

export default async function ShopPage() {
  let products: Awaited<ReturnType<typeof getProducts>> = [];
  try {
    products = await getProducts(48);
  } catch {
    // Shopify not yet configured — graceful empty state
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <header className="mb-8">
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft">Shop</p>
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink">All frames</h1>
      </header>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      ) : (
        <div className="border border-dashed border-line rounded-xl p-16 text-center">
          <p className="font-serif italic text-muted text-lg">The catalog is launching soon.</p>
          <p className="text-sm text-muted-soft mt-2">
            Join the waitlist from the <Link href="/" className="text-accent underline">home page</Link> to get early access.
          </p>
        </div>
      )}
    </div>
  );
}
