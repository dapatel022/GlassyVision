import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getCollectionProducts, getProducts } from '@/lib/commerce/shopify';
import { parseCatalogSearchParams, activeFilterEntries } from '@/lib/commerce/catalog-filters';
import type { CollectionProductsResult, SearchParamsRecord } from '@/lib/commerce/types';
import Breadcrumbs from '@/features/shop/catalog/Breadcrumbs';
import FilterSidebar from '@/features/shop/catalog/FilterSidebar';
import FilterDrawer from '@/features/shop/catalog/FilterDrawer';
import SortDropdown from '@/features/shop/catalog/SortDropdown';
import ActiveFilterPills from '@/features/shop/catalog/ActiveFilterPills';
import ProductGrid from '@/features/shop/catalog/ProductGrid';
import LoadMore from '@/features/shop/catalog/LoadMore';
import Link from 'next/link';

export const revalidate = 900;

interface PlpProps {
  params: Promise<{ collection: string }>;
  searchParams: Promise<SearchParamsRecord>;
}

/** Rebuild the canonical query string from searchParams (order-stable enough for cache keying). */
function toQueryString(sp: SearchParamsRecord): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const value of Array.isArray(v) ? v : v !== undefined ? [v] : []) p.append(k, value);
  }
  return p.toString();
}

// cache() dedupes the generateMetadata + page fetch for identical primitive args.
const getPlpData = cache(async (handle: string, qs: string): Promise<CollectionProductsResult> => {
  const sp: SearchParamsRecord = {};
  const usp = new URLSearchParams(qs);
  for (const key of new Set(usp.keys())) {
    const all = usp.getAll(key);
    sp[key] = all.length > 1 ? all : all[0];
  }
  const q = parseCatalogSearchParams(sp);
  return getCollectionProducts(handle, {
    filters: q.filters,
    sortKey: q.sortKey,
    reverse: q.reverse,
    after: q.after,
  });
});

export async function generateMetadata({ params, searchParams }: PlpProps) {
  const { collection } = await params;
  const qs = toQueryString(await searchParams);
  const res = await getPlpData(collection, qs);
  const title = res.collection?.title ?? 'Shop';
  return {
    title,
    description:
      res.collection?.description || `Browse ${title} — GlassyVision frames, hand-finished in India.`,
  };
}

export default async function CollectionPage({ params, searchParams }: PlpProps) {
  const { collection: handle } = await params;
  const sp = await searchParams;
  const qs = toQueryString(sp);

  let res = await getPlpData(handle, qs);

  // "all" works even before the merchant creates an automated all-collection:
  // fall back to the plain product list (no facets) rather than 404ing.
  if (!res.collection && handle === 'all') {
    const products = await getProducts(48);
    res = {
      collection: { id: 'virtual-all', handle: 'all', title: 'All Frames', description: '', image: null },
      products,
      facets: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    };
  }

  if (!res.collection) notFound();

  const activeCount = activeFilterEntries(qs).length;
  const hasProducts = res.products.length > 0;

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: res.collection.title,
    itemListElement: res.products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `/p/${p.handle}`,
      name: p.title,
    })),
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <header className="space-y-3">
        <Breadcrumbs
          items={[{ label: 'Home', href: '/' }, { label: 'Shop', href: '/shop' }, { label: res.collection.title }]}
        />
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink">
          {res.collection.title}
        </h1>
        {res.collection.description && (
          <p className="text-sm text-muted max-w-2xl">{res.collection.description}</p>
        )}
      </header>

      <div className="border-y border-line py-3 my-8 flex items-center justify-between gap-4">
        <FilterDrawer activeCount={activeCount}>
          <FilterSidebar facets={res.facets} />
        </FilterDrawer>
        <div className="ml-auto">
          <SortDropdown />
        </div>
      </div>

      <div className="flex gap-10">
        <aside className="hidden lg:block w-60 shrink-0" aria-label="Product filters">
          <FilterSidebar facets={res.facets} />
        </aside>

        <main className="flex-1 space-y-6 min-w-0">
          <ActiveFilterPills resultCount={res.products.length} hasNextPage={res.pageInfo.hasNextPage} />

          {hasProducts ? (
            <>
              <ProductGrid products={res.products} />
              <LoadMore
                collectionHandle={res.collection.handle}
                queryString={qs}
                initialPageInfo={res.pageInfo}
              />
            </>
          ) : (
            <div className="border border-dashed border-line rounded-xl p-16 text-center bg-white">
              <p className="font-serif italic text-muted text-lg">No frames match these filters.</p>
              <p className="text-xs text-muted-soft mt-2">
                <Link href={`/shop/${res.collection.handle}`} className="text-accent underline font-bold">
                  Clear all filters
                </Link>{' '}
                or browse the{' '}
                <Link href="/shop" className="text-accent underline font-bold">
                  full collection list
                </Link>
                .
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
