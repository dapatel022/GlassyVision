export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml?: string;
  price: string;
  currencyCode: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  metafields?: ShopifyMetafield[];
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
}

export interface ShopifyMetafield {
  key: string;
  value: string;
  namespace: string;
}

export interface CartLineInput {
  merchandiseId: string;
  quantity: number;
  attributes?: { key: string; value: string }[];
}

export interface ShopifyCart {
  id: string;
  checkoutUrl: string;
  lines: CartLine[];
  totalAmount: string;
  subtotalAmount: string;
  totalTaxAmount: string;
  currencyCode: string;
}

export interface CartLine {
  id: string;
  quantity: number;
  merchandiseId: string;
  title: string;
  price: string;
}
