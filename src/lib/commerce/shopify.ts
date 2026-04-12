import type { ShopifyProduct, ShopifyCart, CartLineInput, ShopifyImage, ShopifyVariant, ShopifyMetafield } from './types';
import { storefrontFetch, PRODUCTS_QUERY, PRODUCT_BY_HANDLE_QUERY, CART_CREATE_MUTATION } from './shopify-storefront';
import { adminFetch, updateInventoryLevel, createFulfillment, createRefund } from './shopify-admin';

function mapProduct(node: any): ShopifyProduct {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    descriptionHtml: node.descriptionHtml,
    price: node.priceRange.minVariantPrice.amount,
    currencyCode: node.priceRange.minVariantPrice.currencyCode,
    images: (node.images?.edges || []).map((e: any) => e.node as ShopifyImage),
    variants: (node.variants?.edges || []).map((e: any) => ({
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

export async function getProducts(first = 50): Promise<ShopifyProduct[]> {
  const data = await storefrontFetch<any>(PRODUCTS_QUERY, { first });
  return data.products.edges.map((e: any) => mapProduct(e.node));
}

export async function getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const data = await storefrontFetch<any>(PRODUCT_BY_HANDLE_QUERY, { handle });
  if (!data.productByHandle) return null;
  return mapProduct(data.productByHandle);
}

export async function createCart(lines: CartLineInput[]): Promise<ShopifyCart> {
  const data = await storefrontFetch<any>(CART_CREATE_MUTATION, {
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
    lines: (cart.lines?.edges || []).map((e: any) => ({
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
