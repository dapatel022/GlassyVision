import type {
  ShopifyProduct,
  ShopifyCart,
  CartLineInput,
  ShopifyImage,
  ShopifyVariant,
  ShopifyMetafield,
  ShopifyCollection,
  CollectionProductsResult,
  ProductFilterInput,
  CatalogFacet,
} from './types';
import {
  storefrontFetch,
  PRODUCTS_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
  CART_CREATE_MUTATION,
  COLLECTIONS_QUERY,
  COLLECTION_PRODUCTS_QUERY,
} from './shopify-storefront';
import { updateInventoryLevel, createFulfillment, createRefund } from './shopify-admin';
import { filterValueParam } from './catalog-filters';

interface ShopifyNode {
  id: string;
  handle: string;
  title: string;
  tags?: string[];
  description: string;
  descriptionHtml: string;
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  images?: {
    edges: Array<{ node: ShopifyImage }>;
  };
  variants?: {
    edges: Array<{ node: {
      id: string;
      title: string;
      sku: string | null;
      price: { amount: string };
      availableForSale: boolean;
      selectedOptions: Array<{ name: string; value: string }>;
    }}>;
  };
  metafields?: ShopifyMetafield[];
}

function mapProduct(node: ShopifyNode): ShopifyProduct {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    tags: node.tags || [],
    description: node.description,
    descriptionHtml: node.descriptionHtml,
    price: node.priceRange.minVariantPrice.amount,
    currencyCode: node.priceRange.minVariantPrice.currencyCode,
    images: (node.images?.edges || []).map((e) => e.node as ShopifyImage),
    variants: (node.variants?.edges || []).map((e) => ({
      id: e.node.id,
      title: e.node.title,
      sku: e.node.sku,
      price: e.node.price.amount,
      availableForSale: e.node.availableForSale,
      selectedOptions: e.node.selectedOptions,
    })) as ShopifyVariant[],
    metafields: (node.metafields || []).filter(Boolean) as ShopifyMetafield[],
  };
}

interface StorefrontResponse {
  products: { edges: Array<{ node: ShopifyNode }> };
}

interface ProductByHandleResponse {
  productByHandle: ShopifyNode;
}

interface CartCreateResponse {
  cartCreate: {
    cart: {
      id: string;
      checkoutUrl: string;
      lines?: {
        edges: Array<{ node: {
          id: string;
          quantity: number;
          merchandise: {
            id: string;
            title: string;
            price: { amount: string };
          };
        }}>;
      };
      cost: {
        totalAmount: { amount: string; currencyCode: string };
        subtotalAmount: { amount: string };
        totalTaxAmount?: { amount: string };
      };
    } | null;
    userErrors?: Array<{ field: string[] | null; message: string }>;
  };
}

// Mock products are a dev-only convenience. In production we must NEVER serve
// fake prices/variant IDs (they would reach the real cart/checkout), so on a
// storefront failure we surface an empty catalog instead.
const allowMockFallback = () => process.env.NODE_ENV !== 'production';

export async function getProducts(first = 50): Promise<ShopifyProduct[]> {
  try {
    const data = await storefrontFetch<StorefrontResponse>(PRODUCTS_QUERY, { first });
    return data.products.edges.map((e) => mapProduct(e.node));
  } catch (err) {
    if (allowMockFallback()) {
      console.warn('Shopify storefront getProducts failed, using mock data (non-production)', err);
      return MOCK_PRODUCTS.slice(0, first);
    }
    console.error('Shopify storefront getProducts failed in production', err);
    return [];
  }
}

export async function getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  try {
    const data = await storefrontFetch<ProductByHandleResponse>(PRODUCT_BY_HANDLE_QUERY, { handle });
    if (!data.productByHandle) return null;
    return mapProduct(data.productByHandle);
  } catch (err) {
    if (allowMockFallback()) {
      console.warn('Shopify storefront getProductByHandle failed, using mock data (non-production)', err);
      return MOCK_PRODUCTS.find((p) => p.handle === handle) || null;
    }
    console.error('Shopify storefront getProductByHandle failed in production', err);
    return null;
  }
}

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

export const MOCK_PRODUCTS: ShopifyProduct[] = [
  {
    id: 'gid://shopify/Product/1111111111',
    handle: 'gv-01-archetype',
    title: 'GV-01 Archetype',
    description: 'Hand-finished bold round optical frames in warm honey tortoise acetate. Engineered for structural elegance, with keyhole bridge and robust five-barrel hinges.',
    descriptionHtml: '<p>Hand-finished bold round optical frames in warm honey tortoise acetate. Engineered for structural elegance, with keyhole bridge and robust five-barrel hinges.</p>',
    price: '145.00',
    currencyCode: 'USD',
    images: [
      {
        url: '/demo/archetype_tortoise.png',
        altText: 'GV-01 Archetype in honey tortoise',
        width: 1000,
        height: 1000
      }
    ],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/11111111110',
        title: 'Tortoise / Medium',
        sku: 'GV-01-TOR-M',
        price: '145.00',
        availableForSale: true,
        selectedOptions: [
          { name: 'Color', value: 'Tortoise' },
          { name: 'Size', value: 'Medium' }
        ]
      },
      {
        id: 'gid://shopify/ProductVariant/11111111111',
        title: 'Tortoise / Small',
        sku: 'GV-01-TOR-S',
        price: '145.00',
        availableForSale: true,
        selectedOptions: [
          { name: 'Color', value: 'Tortoise' },
          { name: 'Size', value: 'Small' }
        ]
      }
    ],
    metafields: [
      { namespace: 'custom', key: 'is_rx_capable', value: 'true' },
      { namespace: 'custom', key: 'frame_eye_size', value: '48' },
      { namespace: 'custom', key: 'frame_bridge', value: '21' },
      { namespace: 'custom', key: 'frame_temple_length', value: '145' }
    ]
  },
  {
    id: 'gid://shopify/Product/2222222222',
    handle: 'gv-02-linear',
    title: 'GV-02 Linear',
    description: 'Sleek round titanium frames in matte gunmetal finish. Ultra-lightweight construction with adjustable nose pads for all-day comfort and stability.',
    descriptionHtml: '<p>Sleek round titanium frames in matte gunmetal finish. Ultra-lightweight construction with adjustable nose pads for all-day comfort and stability.</p>',
    price: '185.00',
    currencyCode: 'USD',
    images: [
      {
        url: '/demo/linear_titanium.png',
        altText: 'GV-02 Linear in matte gunmetal',
        width: 1000,
        height: 1000
      }
    ],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/22222222220',
        title: 'Gunmetal / Medium',
        sku: 'GV-02-GM-M',
        price: '185.00',
        availableForSale: true,
        selectedOptions: [
          { name: 'Color', value: 'Gunmetal' },
          { name: 'Size', value: 'Medium' }
        ]
      },
      {
        id: 'gid://shopify/ProductVariant/22222222221',
        title: 'Gunmetal / Large',
        sku: 'GV-02-GM-L',
        price: '185.00',
        availableForSale: true,
        selectedOptions: [
          { name: 'Color', value: 'Gunmetal' },
          { name: 'Size', value: 'Large' }
        ]
      }
    ],
    metafields: [
      { namespace: 'custom', key: 'is_rx_capable', value: 'true' },
      { namespace: 'custom', key: 'frame_eye_size', value: '47' },
      { namespace: 'custom', key: 'frame_bridge', value: '20' },
      { namespace: 'custom', key: 'frame_temple_length', value: '140' }
    ]
  },
  {
    id: 'gid://shopify/Product/3333333333',
    handle: 'gv-03-voyager',
    title: 'GV-03 Voyager Sun',
    description: 'Classic wire frame aviator sunglasses with polarized forest green lenses. Double bridge detailing in hand-polished 18k gold plating.',
    descriptionHtml: '<p>Classic wire frame aviator sunglasses with polarized forest green lenses. Double bridge detailing in hand-polished 18k gold plating.</p>',
    price: '160.00',
    currencyCode: 'USD',
    images: [
      {
        url: '/demo/voyager_aviator.png',
        altText: 'GV-03 Voyager Sun in Gold/Green',
        width: 1000,
        height: 1000
      }
    ],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/33333333330',
        title: 'Gold / Medium',
        sku: 'GV-03-GLD-M',
        price: '160.00',
        availableForSale: true,
        selectedOptions: [
          { name: 'Color', value: 'Gold' },
          { name: 'Size', value: 'Medium' }
        ]
      }
    ],
    metafields: [
      { namespace: 'custom', key: 'is_rx_capable', value: 'true' },
      { namespace: 'custom', key: 'frame_eye_size', value: '55' },
      { namespace: 'custom', key: 'frame_bridge', value: '14' },
      { namespace: 'custom', key: 'frame_temple_length', value: '145' }
    ]
  },
  {
    id: 'gid://shopify/Product/4444444444',
    handle: 'gv-04-editor',
    title: 'GV-04 Editor',
    description: 'Thick black acetate square glasses with hand-riveted dual pin hinges. A bold, structured frame that makes a refined statement.',
    descriptionHtml: '<p>Thick black acetate square glasses with hand-riveted dual pin hinges. A bold, structured frame that makes a refined statement.</p>',
    price: '150.00',
    currencyCode: 'USD',
    images: [
      {
        url: '/demo/editor_black.png',
        altText: 'GV-04 Editor in polished black',
        width: 1000,
        height: 1000
      }
    ],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/44444444440',
        title: 'Black / Medium',
        sku: 'GV-04-BLK-M',
        price: '150.00',
        availableForSale: true,
        selectedOptions: [
          { name: 'Color', value: 'Black' },
          { name: 'Size', value: 'Medium' }
        ]
      },
      {
        id: 'gid://shopify/ProductVariant/44444444441',
        title: 'Black / Large',
        sku: 'GV-04-BLK-L',
        price: '150.00',
        availableForSale: true,
        selectedOptions: [
          { name: 'Color', value: 'Black' },
          { name: 'Size', value: 'Large' }
        ]
      }
    ],
    metafields: [
      { namespace: 'custom', key: 'is_rx_capable', value: 'true' },
      { namespace: 'custom', key: 'frame_eye_size', value: '50' },
      { namespace: 'custom', key: 'frame_bridge', value: '22' },
      { namespace: 'custom', key: 'frame_temple_length', value: '150' }
    ]
  }
];

export async function createCart(lines: CartLineInput[]): Promise<ShopifyCart> {
  const data = await storefrontFetch<CartCreateResponse>(CART_CREATE_MUTATION, {
    input: {
      lines: lines.map((l) => ({
        merchandiseId: l.merchandiseId,
        quantity: l.quantity,
        ...(l.attributes ? { attributes: l.attributes } : {}),
      })),
    },
  });

  // Surface Shopify's cartCreate userErrors (e.g. a stored variant that is now
  // unavailable/deleted) instead of dereferencing a null cart and throwing an
  // opaque TypeError at checkout.
  const userErrors = data.cartCreate.userErrors ?? [];
  const cart = data.cartCreate.cart;
  if (!cart) {
    const reason = userErrors.map((e) => e.message).join('; ') || 'Cart could not be created';
    throw new Error(`Checkout failed: ${reason}. An item may no longer be available — please remove it and try again.`);
  }
  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    lines: (cart.lines?.edges || []).map((e) => ({
      id: e.node.id,
      quantity: e.node.quantity,
      merchandiseId: e.node.merchandise.id,
      title: e.node.merchandise.title,
      price: e.node.merchandise.price.amount,
    })),
    totalAmount: cart.cost.totalAmount.amount,
    subtotalAmount: cart.cost.subtotalAmount.amount,
    totalTaxAmount: cart.cost.totalTaxAmount?.amount || '0.00',
    currencyCode: cart.cost.totalAmount.currencyCode,
  };
}

export { updateInventoryLevel, createFulfillment, createRefund };
