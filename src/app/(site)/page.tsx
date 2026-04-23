import Link from 'next/link';
import { getProducts } from '@/lib/commerce/shopify';
import ProductCard from '@/features/shop/ProductCard';
import WaitlistForm from '@/features/shop/WaitlistForm';

export const revalidate = 900;

export default async function HomePage() {
  let products: Awaited<ReturnType<typeof getProducts>> = [];
  try {
    products = await getProducts(8);
  } catch {
    // Shopify not yet configured — render placeholder state
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-32 text-center">
          <p className="font-mono text-[10px] font-bold tracking-[3px] uppercase text-accent mb-6">
            DROP Nº 01 · COMING SOON
          </p>
          <h1 className="font-sans text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter uppercase text-ink leading-[0.85]">
            EYEWEAR,<br />DROPPED<span className="text-accent">.</span>
          </h1>
          <p className="mt-6 font-serif italic text-lg text-muted max-w-md mx-auto leading-relaxed">
            Small-batch frames, hand-finished in India. Released in limited drops.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link
              href="/shop"
              className="px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light transition-colors"
            >
              Shop the drop
            </Link>
            <Link
              href="/story"
              className="px-6 py-3 border border-line text-ink font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-base-deeper transition-colors"
            >
              Our story
            </Link>
          </div>
        </div>
      </section>

      {/* Product grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft">The collection</p>
            <h2 className="font-sans text-3xl font-black tracking-tight uppercase text-ink">Drop Nº 01</h2>
          </div>
          <Link href="/shop" className="text-sm font-sans font-bold uppercase tracking-wider text-accent hover:text-accent-light">
            View all →
          </Link>
        </div>

        {products.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <div className="border border-dashed border-line rounded-xl p-12 text-center">
            <p className="font-serif italic text-muted">
              Catalog launching soon. Join the waitlist to get early access.
            </p>
          </div>
        )}
      </section>

      {/* Waitlist CTA */}
      <section className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-3">
          Be first in line
        </h2>
        <p className="text-muted mb-6 font-serif italic">
          Drops sell out fast. Get the link 24 hours early.
        </p>
        <WaitlistForm dropSlug="drop-01" />
      </section>
    </div>
  );
}
