'use client';

import { useState } from 'react';
import type { CatalogPageInfo, ShopifyProduct } from '@/lib/commerce/types';
import { withAfter } from '@/lib/commerce/catalog-filters';
import { loadMoreProducts } from '@/features/shop/catalog/load-more-action';
import ProductGrid from '@/features/shop/catalog/ProductGrid';

interface LoadMoreProps {
  collectionHandle: string;
  queryString: string;
  initialPageInfo: CatalogPageInfo;
}

export default function LoadMore({ collectionHandle, queryString, initialPageInfo }: LoadMoreProps) {
  const [pages, setPages] = useState<ShopifyProduct[][]>([]);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [loading, setLoading] = useState(false);

  // Reset appended pages when the filter/sort context changes — the parent
  // re-renders us with a new queryString but React keeps the instance.
  const [prevQs, setPrevQs] = useState(queryString);
  if (prevQs !== queryString) {
    setPrevQs(queryString);
    setPages([]);
    setPageInfo(initialPageInfo);
  }

  if (!pageInfo.hasNextPage && pages.length === 0) return null;

  async function onLoadMore() {
    if (!pageInfo.endCursor) return;
    setLoading(true);
    try {
      const res = await loadMoreProducts(collectionHandle, withAfter(queryString, pageInfo.endCursor));
      setPages((prev) => [...prev, res.products]);
      setPageInfo(res.pageInfo);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {pages.map((products, i) => (
        <ProductGrid key={i} products={products} />
      ))}
      {pageInfo.hasNextPage && pageInfo.endCursor && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="text-xs font-mono font-bold uppercase tracking-wider text-accent border border-accent rounded-lg px-6 py-2.5 hover:bg-accent/5 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
          <noscript>
            {pageInfo.endCursor && (
              <a href={`?${withAfter(queryString, pageInfo.endCursor)}`} rel="nofollow" className="text-xs text-accent underline ml-3">
                Next page
              </a>
            )}
          </noscript>
        </div>
      )}
    </div>
  );
}
