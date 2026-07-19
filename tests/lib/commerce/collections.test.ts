import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStorefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', () => ({
  storefrontFetch: mockStorefrontFetch,
  PRODUCTS_QUERY: 'PRODUCTS_QUERY',
  PRODUCT_BY_HANDLE_QUERY: 'PRODUCT_BY_HANDLE_QUERY',
  CART_CREATE_MUTATION: 'CART_CREATE_MUTATION',
  COLLECTIONS_QUERY: 'COLLECTIONS_QUERY',
  COLLECTION_PRODUCTS_QUERY: 'COLLECTION_PRODUCTS_QUERY',
}));
vi.mock('@/lib/commerce/shopify-admin', () => ({
  updateInventoryLevel: vi.fn(),
  createFulfillment: vi.fn(),
  createRefund: vi.fn(),
}));

beforeEach(() => mockStorefrontFetch.mockReset());
afterEach(() => vi.unstubAllEnvs());

const PRODUCT_NODE = {
  id: 'gid://shopify/Product/1',
  handle: 'halcyon-aviator',
  title: 'Halcyon Aviator',
  description: 'desc',
  tags: ['new', 'bestseller'],
  priceRange: { minVariantPrice: { amount: '95.00', currencyCode: 'USD' } },
  images: { edges: [] },
  variants: { edges: [] },
  metafields: [{ namespace: 'custom', key: 'is_rx_capable', value: 'true' }],
};

describe('getCollections', () => {
  it('maps collection edges to ShopifyCollection[]', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      collections: {
        edges: [
          {
            node: {
              id: 'gid://shopify/Collection/1',
              handle: 'mens-sunglasses',
              title: "Men's Sunglasses",
              description: 'Sun for men',
              image: { url: 'https://cdn/x.png', altText: null, width: 100, height: 100 },
            },
          },
        ],
      },
    });
    const { getCollections } = await import('@/lib/commerce/shopify');
    const cols = await getCollections();
    expect(mockStorefrontFetch).toHaveBeenCalledWith('COLLECTIONS_QUERY', { first: 50 });
    expect(cols).toEqual([
      {
        id: 'gid://shopify/Collection/1',
        handle: 'mens-sunglasses',
        title: "Men's Sunglasses",
        description: 'Sun for men',
        image: { url: 'https://cdn/x.png', altText: null, width: 100, height: 100 },
      },
    ]);
  });

  it('returns [] on error in production (never mocks)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    const { getCollections } = await import('@/lib/commerce/shopify');
    expect(await getCollections()).toEqual([]);
  });

  it('falls back to a mock "all" collection on error outside production', async () => {
    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    const { getCollections } = await import('@/lib/commerce/shopify');
    const cols = await getCollections();
    expect(cols).toHaveLength(1);
    expect(cols[0].handle).toBe('all');
  });
});

describe('getCollectionProducts', () => {
  it('sends handle, paging, sort and filters; maps products, facets and pageInfo', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      collection: {
        id: 'gid://shopify/Collection/1',
        handle: 'all',
        title: 'All Frames',
        description: '',
        image: null,
        products: {
          filters: [
            {
              id: 'filter.p.m.custom.frame_shape',
              label: 'Frame shape',
              type: 'LIST',
              values: [
                {
                  id: 'v1',
                  label: 'Round',
                  count: 2,
                  input: '{"productMetafield":{"namespace":"custom","key":"frame_shape","value":"round"}}',
                },
              ],
            },
            {
              id: 'filter.v.price',
              label: 'Price',
              type: 'PRICE_RANGE',
              values: [{ id: 'p1', label: 'Price', count: 3, input: { price: { min: 0, max: 200 } } }],
            },
          ],
          pageInfo: { hasNextPage: true, endCursor: 'CUR' },
          edges: [{ node: PRODUCT_NODE }],
        },
      },
    });

    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    const res = await getCollectionProducts('all', {
      filters: [{ available: true }],
      sortKey: 'PRICE',
      reverse: true,
      after: 'PREV',
      first: 12,
    });

    expect(mockStorefrontFetch).toHaveBeenCalledWith('COLLECTION_PRODUCTS_QUERY', {
      handle: 'all',
      first: 12,
      after: 'PREV',
      filters: [{ available: true }],
      sortKey: 'PRICE',
      reverse: true,
    });

    expect(res.collection?.title).toBe('All Frames');
    expect(res.products).toHaveLength(1);
    expect(res.products[0].tags).toEqual(['new', 'bestseller']);
    expect(res.pageInfo).toEqual({ hasNextPage: true, endCursor: 'CUR' });

    // LIST facet value got a param pair from its input JSON…
    expect(res.facets[0].values[0].param).toEqual({ key: 'm.custom.frame_shape', value: 'round' });
    // …the price facet (object-typed input) survives normalization with param null.
    expect(res.facets[1].type).toBe('PRICE_RANGE');
    expect(res.facets[1].values[0].param).toBeNull();
  });

  it('omits filters/after/sort variables when not provided', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({ collection: null });
    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    await getCollectionProducts('missing');
    expect(mockStorefrontFetch).toHaveBeenCalledWith('COLLECTION_PRODUCTS_QUERY', {
      handle: 'missing',
      first: 24,
      after: null,
      filters: undefined,
      sortKey: 'COLLECTION_DEFAULT',
      reverse: false,
    });
  });

  it('returns null collection for an unknown handle', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({ collection: null });
    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    const res = await getCollectionProducts('nope');
    expect(res.collection).toBeNull();
    expect(res.products).toEqual([]);
    expect(res.facets).toEqual([]);
    expect(res.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it('production error path returns empty result, no mock data', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    const res = await getCollectionProducts('all');
    expect(res.collection).toBeNull();
    expect(res.products).toEqual([]);
  });

  it('dev error path falls back to mock products with empty facets', async () => {
    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    const { getCollectionProducts } = await import('@/lib/commerce/shopify');
    const res = await getCollectionProducts('all');
    expect(res.collection?.handle).toBe('all');
    expect(res.products.length).toBeGreaterThan(0);
    expect(res.facets).toEqual([]);
  });
});
