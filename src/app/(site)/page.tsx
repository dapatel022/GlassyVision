import Link from 'next/link';
import { getProducts } from '@/lib/commerce/shopify';
import ProductCard from '@/features/shop/ProductCard';
import WaitlistForm from '@/features/shop/WaitlistForm';
import HeroShowcase from '@/features/shop/HeroShowcase';
import DropCountdown from '@/features/shop/DropCountdown';

export const revalidate = 900;

export default async function HomePage() {
  let products: Awaited<ReturnType<typeof getProducts>> = [];
  try {
    products = await getProducts(8);
  } catch {
    // Shopify not yet configured — render placeholder state
  }

  return (
    <div className="space-y-16 pb-12">
      {/* Editorial Hero Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 md:pt-20">
        <HeroShowcase />
      </section>

      {/* Infinite Scrolling Ticker */}
      <div className="bg-ink text-white py-4 overflow-hidden border-y border-line">
        <div className="flex whitespace-nowrap animate-slide text-xs font-mono tracking-[4px] uppercase font-bold text-base-deeper">
          <span className="mx-8">Hand-finished in India & Syracuse</span>
          <span className="mx-8 text-accent">•</span>
          <span className="mx-8">Cellulose Acetate & Pure Titanium</span>
          <span className="mx-8 text-accent">•</span>
          <span className="mx-8">Small-Batch Limited Runs Only</span>
          <span className="mx-8 text-accent">•</span>
          <span className="mx-8">Prescription Ready Optics</span>
          <span className="mx-8 text-accent">•</span>
          {/* duplicate for infinite illusion */}
          <span className="mx-8">Hand-finished in India & Syracuse</span>
          <span className="mx-8 text-accent">•</span>
          <span className="mx-8">Cellulose Acetate & Pure Titanium</span>
          <span className="mx-8 text-accent">•</span>
          <span className="mx-8">Small-Batch Limited Runs Only</span>
          <span className="mx-8 text-accent">•</span>
          <span className="mx-8">Prescription Ready Optics</span>
          <span className="mx-8 text-accent">•</span>
        </div>
      </div>

      {/* Drop Status & Urgency Metrics Panel */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white border border-line rounded-2xl p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8 shadow-sm">
          <div className="space-y-2">
            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-muted-soft">Drop Allocation</p>
            <h3 className="font-mono text-2xl font-bold text-ink">500 Pieces Total</h3>
            <p className="text-xs text-muted font-serif italic">Strictly limited. No restocks planned.</p>
          </div>
          <div className="space-y-2 border-t md:border-t-0 md:border-l border-line pt-6 md:pt-0 md:pl-8">
            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-muted-soft">Waitlist Active</p>
            <h3 className="font-mono text-2xl font-bold text-accent">2,418 Joined</h3>
            <p className="text-xs text-muted font-serif italic">Get access 24 hours before public drop.</p>
          </div>
          <div className="space-y-2 border-t md:border-t-0 md:border-l border-line pt-6 md:pt-0 md:pl-8">
            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-muted-soft">Countdown to Release</p>
            <DropCountdown />
          </div>
        </div>
      </section>

      {/* Craftsmanship Spotlight */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-gradient-to-tr from-accent/5 via-transparent to-base-deeper border border-line rounded-2xl p-8 md:p-12 flex flex-col lg:flex-row items-center gap-12 shadow-sm">
          <div className="flex-1 space-y-4">
            <p className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-accent">Our Philosophy</p>
            <h2 className="font-sans text-3xl md:text-5xl font-black uppercase text-ink leading-tight">
              Every Bevel Hand-Polished. Every Hinge Hand-Riveted.
            </h2>
            <p className="font-serif italic text-muted text-base leading-relaxed">
              We skip mass manufacturing. Our frames are sculpted from custom acetate blocks and lightweight titanium plates, hand-shaped and tumbled in wooden pegs for three days to achieve a signature high-gloss luster. Exclusivity is built in.
            </p>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-4 w-full">
            <div className="bg-white/60 backdrop-blur border border-line rounded-xl p-5 shadow-sm space-y-1.5">
              <span className="text-xl block">🪚</span>
              <h4 className="font-sans font-bold text-xs uppercase text-ink">Acetate Sculpting</h4>
              <p className="text-[10px] text-muted-soft leading-normal">Milled from organic wood-pulp cotton plates, ensuring hypoallergenic comfort.</p>
            </div>
            <div className="bg-white/60 backdrop-blur border border-line rounded-xl p-5 shadow-sm space-y-1.5">
              <span className="text-xl block">📐</span>
              <h4 className="font-sans font-bold text-xs uppercase text-ink">5-Barrel Hinges</h4>
              <p className="text-[10px] text-muted-soft leading-normal">Dual pin hand-riveted hinges for indestructible temple alignments.</p>
            </div>
            <div className="bg-white/60 backdrop-blur border border-line rounded-xl p-5 shadow-sm space-y-1.5">
              <span className="text-xl block">🩺</span>
              <h4 className="font-sans font-bold text-xs uppercase text-ink">Lab Fitted</h4>
              <p className="text-[10px] text-muted-soft leading-normal">Optometrist double-checked lens cutting and alignment per prescription power.</p>
            </div>
            <div className="bg-white/60 backdrop-blur border border-line rounded-xl p-5 shadow-sm space-y-1.5">
              <span className="text-xl block">📦</span>
              <h4 className="font-sans font-bold text-xs uppercase text-ink">Unique drops</h4>
              <p className="text-[10px] text-muted-soft leading-normal">Allocated inventory batching to avoid supply surpluses and waste.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Product Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft">Drop catalog</p>
            <h2 className="font-sans text-3xl font-black tracking-tight uppercase text-ink">Active Collection</h2>
          </div>
          <Link href="/shop" className="text-xs font-sans font-bold uppercase tracking-widest text-accent hover:text-accent-light transition-colors">
            View all frames →
          </Link>
        </div>

        {products.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <div className="border border-dashed border-line rounded-xl p-12 text-center bg-white">
            <p className="font-serif italic text-muted">
              Catalog launching soon. Join the waitlist to get early access.
            </p>
          </div>
        )}
      </section>

      {/* Waitlist CTA */}
      <section className="max-w-xl mx-auto px-4 sm:px-6 text-center space-y-6">
        <h2 className="font-sans text-3xl font-black tracking-tight uppercase text-ink">
          Be first in line
        </h2>
        <p className="text-muted font-serif italic leading-relaxed">
          Drops sell out quickly. Enter your email and optional phone number to secure early access notifications 24 hours prior to the next launch.
        </p>
        <WaitlistForm dropSlug="drop-01" />
      </section>
    </div>
  );
}
