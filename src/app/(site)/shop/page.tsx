import Link from 'next/link';
import { getProducts } from '@/lib/commerce/shopify';
import ProductCard from '@/features/shop/ProductCard';

export const revalidate = 900;

export const metadata = {
  title: 'Shop',
  description: 'All GlassyVision frames, hand-finished in India.',
};

interface ShopPageProps {
  searchParams: Promise<{
    shape?: string;
    size?: string;
    style?: string;
    sun?: string;
    quiz?: string;
  }>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const { shape, size, style, sun, quiz } = await searchParams;

  let products: Awaited<ReturnType<typeof getProducts>> = [];
  try {
    products = await getProducts(48);
  } catch {
    // Shopify not yet configured — graceful empty state
  }

  // Filter products dynamically based on search parameters (e.g. from the quiz)
  let filtered = products;

  if (shape && shape !== 'any') {
    const shapes = shape.toLowerCase().split(',');
    filtered = filtered.filter((p) => {
      const text = `${p.title} ${p.handle} ${p.description || ''}`.toLowerCase();
      return shapes.some((s) => text.includes(s));
    });
  }

  if (size && size !== 'any') {
    const targetSize = size.toLowerCase();
    filtered = filtered.filter((p) => {
      if (p.variants.length === 0) return true; // fallback
      return p.variants.some((v) => {
        const optionText = v.title.toLowerCase();
        if (targetSize === 's') return optionText.includes('small') || optionText.includes(' s ') || optionText.endsWith('/ s') || optionText.endsWith('/ small') || optionText === 's';
        if (targetSize === 'm') return optionText.includes('medium') || optionText.includes(' m ') || optionText.endsWith('/ m') || optionText.endsWith('/ medium') || optionText === 'm';
        if (targetSize === 'l') return optionText.includes('large') || optionText.includes(' l ') || optionText.endsWith('/ l') || optionText.endsWith('/ large') || optionText === 'l';
        return true;
      });
    });
  }

  if (sun === 'true') {
    filtered = filtered.filter((p) => p.title.toLowerCase().includes('sun') || p.handle.toLowerCase().includes('sun'));
  } else if (sun === 'false') {
    filtered = filtered.filter((p) => !p.title.toLowerCase().includes('sun') && !p.handle.toLowerCase().includes('sun'));
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft">Shop Collection</p>
          <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink">
            {quiz === 'true' ? 'Your Matches' : 'All frames'}
          </h1>
          {quiz === 'true' && (
            <p className="text-xs text-muted-soft mt-1 font-serif italic">
              Custom matches matched from your Frame Finder Quiz.
            </p>
          )}
        </div>
        {(shape || size || style || sun) && (
          <Link
            href="/shop"
            className="text-xs font-mono font-bold uppercase tracking-wider text-accent border border-accent rounded-lg px-4 py-2 hover:bg-accent/5 transition-all self-start md:self-auto"
          >
            Reset Filters ×
          </Link>
        )}
      </header>

      {/* Editorial Filter Header Bar */}
      <div className="border-y border-line py-4 my-8 flex flex-wrap gap-x-8 gap-y-4 items-center justify-between text-xs font-mono">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {/* Lens Type Toggle */}
          <div className="flex items-center gap-3">
            <span className="text-muted-soft uppercase font-bold">Lens Intent:</span>
            <Link href="/shop" className={`hover:text-accent transition-colors ${!sun ? 'text-accent font-bold underline underline-offset-4' : 'text-muted'}`}>All</Link>
            <span className="text-line">|</span>
            <Link href="/shop?sun=false" className={`hover:text-accent transition-colors ${sun === 'false' ? 'text-accent font-bold underline underline-offset-4' : 'text-muted'}`}>Clear (Rx Ready)</Link>
            <span className="text-line">|</span>
            <Link href="/shop?sun=true" className={`hover:text-accent transition-colors ${sun === 'true' ? 'text-accent font-bold underline underline-offset-4' : 'text-muted'}`}>Sunglasses</Link>
          </div>

          {/* Size Filter Toggle */}
          <div className="flex items-center gap-3 md:border-l md:border-line md:pl-8">
            <span className="text-muted-soft uppercase font-bold">Size fit:</span>
            <Link href="/shop" className={`hover:text-accent transition-colors ${!size ? 'text-accent font-bold underline underline-offset-4' : 'text-muted'}`}>All</Link>
            <span className="text-line">|</span>
            <Link href="/shop?size=s" className={`hover:text-accent transition-colors ${size === 's' ? 'text-accent font-bold underline underline-offset-4' : 'text-muted'}`}>Narrow (S)</Link>
            <span className="text-line">|</span>
            <Link href="/shop?size=m" className={`hover:text-accent transition-colors ${size === 'm' ? 'text-accent font-bold underline underline-offset-4' : 'text-muted'}`}>Medium (M)</Link>
            <span className="text-line">|</span>
            <Link href="/shop?size=l" className={`hover:text-accent transition-colors ${size === 'l' ? 'text-accent font-bold underline underline-offset-4' : 'text-muted'}`}>Wide (L)</Link>
          </div>
        </div>

        <div className="text-muted-soft font-serif italic">
          Showing {filtered.length} of {products.length} models
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-fade-in-up">
          {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      ) : (
        <div className="border border-dashed border-line rounded-xl p-16 text-center bg-white">
          <p className="font-serif italic text-muted text-lg">No matching frames found.</p>
          <p className="text-xs text-muted-soft mt-2">
            Try adjusting your choices or view the <Link href="/shop" className="text-accent underline font-bold">entire collection</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
