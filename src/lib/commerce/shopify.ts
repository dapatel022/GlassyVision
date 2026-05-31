import type { ShopifyProduct, ShopifyCart, CartLineInput, ShopifyImage, ShopifyVariant, ShopifyMetafield } from './types';
import { storefrontFetch, PRODUCTS_QUERY, PRODUCT_BY_HANDLE_QUERY, CART_CREATE_MUTATION } from './shopify-storefront';
import { updateInventoryLevel, createFulfillment, createRefund } from './shopify-admin';

interface ShopifyNode {
  id: string;
  handle: string;
  title: string;
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
    };
  };
}

export async function getProducts(first = 50): Promise<ShopifyProduct[]> {
  try {
    const data = await storefrontFetch<StorefrontResponse>(PRODUCTS_QUERY, { first });
    return data.products.edges.map((e) => mapProduct(e.node));
  } catch (err) {
    console.warn("Shopify storefront getProducts failed, using mock data", err);
    return MOCK_PRODUCTS.slice(0, first);
  }
}

export async function getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  try {
    const data = await storefrontFetch<ProductByHandleResponse>(PRODUCT_BY_HANDLE_QUERY, { handle });
    if (!data.productByHandle) return null;
    return mapProduct(data.productByHandle);
  } catch (err) {
    console.warn("Shopify storefront getProductByHandle failed, using mock data", err);
    return MOCK_PRODUCTS.find((p) => p.handle === handle) || null;
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

  const cart = data.cartCreate.cart;
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
