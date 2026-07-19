import type {
  ShopifyCollection,
  CollectionProductsResult,
  ProductFilterInput,
  CatalogFacet,
  ShopifyImage,
} from './types';
import { storefrontFetch, COLLECTIONS_QUERY, COLLECTION_PRODUCTS_QUERY } from './shopify-storefront';
import { filterValueParam } from './catalog-filters';
import { mapProduct, allowMockFallback, MOCK_PRODUCTS, type ShopifyNode } from './shopify';

interface CollectionNode {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: ShopifyImage | null;
}

interface CollectionsResponse {
  collections: { edges: Array<{ node: CollectionNode }> };
}

interface FacetValueNode { id: string; label: string; count: number; input: unknown }
interface FacetNode { id: string; label: string; type: string; values: FacetValueNode[] }

interface CollectionProductsResponse {
  collection:
    | (CollectionNode & {
        products: {
          filters?: FacetNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          edges: Array<{ node: ShopifyNode }>;
        };
      })
    | null;
}

function mapCollection(node: CollectionNode): ShopifyCollection {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description || '',
    image: node.image ?? null,
  };
}

// The Storefront `input` scalar may serialize as a JSON string or an object.
function facetInputJson(input: unknown): string {
  return typeof input === 'string' ? input : JSON.stringify(input);
}

function mapFacets(filters: FacetNode[] | undefined): CatalogFacet[] {
  return (filters || []).map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    values: (f.values || []).map((v) => ({
      id: v.id,
      label: v.label,
      count: v.count,
      param: filterValueParam(facetInputJson(v.input)),
    })),
  }));
}

const EMPTY_COLLECTION_RESULT: CollectionProductsResult = {
  collection: null,
  products: [],
  facets: [],
  pageInfo: { hasNextPage: false, endCursor: null },
};

export async function getCollections(first = 50): Promise<ShopifyCollection[]> {
  try {
    const data = await storefrontFetch<CollectionsResponse>(COLLECTIONS_QUERY, { first });
    return data.collections.edges.map((e) => mapCollection(e.node));
  } catch (err) {
    if (allowMockFallback()) {
      console.warn('Shopify getCollections failed, using mock collection (non-production)', err);
      return [{ id: 'mock-collection-all', handle: 'all', title: 'All Frames', description: '', image: null }];
    }
    console.error('Shopify getCollections failed in production', err);
    return [];
  }
}

export async function getCollectionProducts(
  handle: string,
  opts: {
    filters?: ProductFilterInput[];
    sortKey?: string;
    reverse?: boolean;
    after?: string | null;
    first?: number;
  } = {},
): Promise<CollectionProductsResult> {
  try {
    const data = await storefrontFetch<CollectionProductsResponse>(COLLECTION_PRODUCTS_QUERY, {
      handle,
      first: opts.first ?? 24,
      after: opts.after ?? null,
      filters: opts.filters && opts.filters.length > 0 ? opts.filters : undefined,
      sortKey: opts.sortKey ?? 'COLLECTION_DEFAULT',
      reverse: opts.reverse ?? false,
    });
    if (!data.collection) return EMPTY_COLLECTION_RESULT;
    return {
      collection: mapCollection(data.collection),
      products: data.collection.products.edges.map((e) => mapProduct(e.node)),
      facets: mapFacets(data.collection.products.filters),
      pageInfo: {
        hasNextPage: data.collection.products.pageInfo.hasNextPage,
        endCursor: data.collection.products.pageInfo.endCursor ?? null,
      },
    };
  } catch (err) {
    if (allowMockFallback()) {
      console.warn('Shopify getCollectionProducts failed, using mock data (non-production)', err);
      return {
        collection: {
          id: `mock-collection-${handle}`,
          handle,
          title: handle === 'all' ? 'All Frames' : handle.replace(/-/g, ' '),
          description: '',
          image: null,
        },
        products: MOCK_PRODUCTS,
        facets: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    }
    console.error('Shopify getCollectionProducts failed in production', err);
    return EMPTY_COLLECTION_RESULT;
  }
}
