'use server';

import { getCollectionProducts } from '@/lib/commerce/shopify';
import { parseCatalogSearchParams } from '@/lib/commerce/catalog-filters';
import type { CatalogPageInfo, SearchParamsRecord, ShopifyProduct } from '@/lib/commerce/types';

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{0,254}$/;
const MAX_QS_LENGTH = 2000;

const EMPTY: { products: ShopifyProduct[]; pageInfo: CatalogPageInfo } = {
  products: [],
  pageInfo: { hasNextPage: false, endCursor: null },
};

/**
 * Public storefront pagination. Input is attacker-controllable, so validate
 * shape/size before touching the commerce layer (matches the project's
 * defensive server-action posture even for unauthenticated reads).
 */
export async function loadMoreProducts(
  handle: string,
  queryString: string,
): Promise<{ products: ShopifyProduct[]; pageInfo: CatalogPageInfo }> {
  if (!HANDLE_RE.test(handle) || queryString.length > MAX_QS_LENGTH) return EMPTY;

  const usp = new URLSearchParams(queryString);
  const sp: SearchParamsRecord = {};
  for (const key of new Set(usp.keys())) {
    const all = usp.getAll(key);
    sp[key] = all.length > 1 ? all : all[0];
  }

  const q = parseCatalogSearchParams(sp);
  const res = await getCollectionProducts(handle, {
    filters: q.filters,
    sortKey: q.sortKey,
    reverse: q.reverse,
    after: q.after,
  });
  return { products: res.products, pageInfo: res.pageInfo };
}
