import { redirect } from 'next/navigation';
import { getCollections } from '@/lib/commerce/shopify';
import { mapLegacyShopParams } from '@/lib/commerce/catalog-filters';
import type { SearchParamsRecord } from '@/lib/commerce/types';
import CategoryTiles from '@/features/shop/catalog/CategoryTiles';

export const revalidate = 900;

export const metadata = {
  title: 'Shop',
  description: 'All GlassyVision frames, hand-finished in India — browse by category.',
};

interface ShopPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const sp = await searchParams;

  // Legacy deep links (quiz results, old bookmarks) land on the new catalog.
  if (sp.shape || sp.size || sp.style || sp.sun || sp.quiz) {
    const qs = mapLegacyShopParams(sp);
    redirect(qs ? `/shop/all?${qs}` : '/shop/all');
  }

  const collections = await getCollections();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <header>
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft">Shop Collection</p>
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink">Browse by category</h1>
        <p className="text-sm text-muted mt-2 max-w-2xl">
          Categories are curated in real time — every tile below is live from our catalog.
        </p>
      </header>

      <div className="mt-10">
        <CategoryTiles collections={collections} />
      </div>
    </div>
  );
}
