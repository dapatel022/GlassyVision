import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetCollectionProducts = vi.fn();
vi.mock('@/lib/commerce/shopify', () => ({
  getCollectionProducts: mockGetCollectionProducts,
}));

beforeEach(() => mockGetCollectionProducts.mockReset());

describe('loadMoreProducts server action', () => {
  it('parses the query string (incl. repeated filters + after) and fetches the next page', async () => {
    mockGetCollectionProducts.mockResolvedValueOnce({
      collection: { id: 'c', handle: 'all', title: 'All', description: '', image: null },
      products: [{ id: 'p2' }],
      facets: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    const { loadMoreProducts } = await import('@/features/shop/catalog/load-more-action');
    const res = await loadMoreProducts('all', 'vendor=A&vendor=B&sort=price-asc&after=CUR');

    expect(mockGetCollectionProducts).toHaveBeenCalledWith('all', {
      filters: [{ productVendor: 'A' }, { productVendor: 'B' }],
      sortKey: 'PRICE',
      reverse: false,
      after: 'CUR',
    });
    expect(res.products).toEqual([{ id: 'p2' }]);
    expect(res.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it('rejects malformed handles and oversized query strings without fetching', async () => {
    const { loadMoreProducts } = await import('@/features/shop/catalog/load-more-action');
    expect(await loadMoreProducts('NOT_A_HANDLE!', 'x=1')).toEqual({
      products: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    expect(await loadMoreProducts('all', 'a'.repeat(3000))).toEqual({
      products: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    expect(mockGetCollectionProducts).not.toHaveBeenCalled();
  });
});
