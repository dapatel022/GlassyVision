import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Shopify Commerce Layer', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getProducts returns typed products from Storefront API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          products: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/Product/1',
                  handle: 'bombay-round',
                  title: 'Bombay Round',
                  description: 'Japanese acetate',
                  priceRange: {
                    minVariantPrice: { amount: '128.00', currencyCode: 'USD' },
                  },
                  images: { edges: [] },
                  variants: { edges: [] },
                },
              },
            ],
          },
        },
      }),
    });

    const { getProducts } = await import('@/lib/commerce/shopify');
    const products = await getProducts();

    expect(products).toHaveLength(1);
    expect(products[0].handle).toBe('bombay-round');
    expect(products[0].title).toBe('Bombay Round');
    expect(products[0].price).toBe('128.00');
  });

  it('getProductByHandle returns a single product', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          productByHandle: {
            id: 'gid://shopify/Product/1',
            handle: 'bombay-round',
            title: 'Bombay Round',
            description: 'Japanese acetate',
            descriptionHtml: '<p>Japanese acetate</p>',
            priceRange: {
              minVariantPrice: { amount: '128.00', currencyCode: 'USD' },
            },
            images: { edges: [] },
            variants: { edges: [] },
            metafields: [],
          },
        },
      }),
    });

    const { getProductByHandle } = await import('@/lib/commerce/shopify');
    const product = await getProductByHandle('bombay-round');

    expect(product).not.toBeNull();
    expect(product!.handle).toBe('bombay-round');
  });

  it('createCart returns a cart with checkout URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          cartCreate: {
            cart: {
              id: 'gid://shopify/Cart/1',
              checkoutUrl: 'https://test-store.myshopify.com/cart/c/abc123',
              lines: { edges: [] },
              cost: {
                totalAmount: { amount: '128.00', currencyCode: 'USD' },
                subtotalAmount: { amount: '128.00', currencyCode: 'USD' },
                totalTaxAmount: { amount: '0.00', currencyCode: 'USD' },
              },
            },
          },
        },
      }),
    });

    const { createCart } = await import('@/lib/commerce/shopify');
    const cart = await createCart([
      { merchandiseId: 'gid://shopify/ProductVariant/1', quantity: 1 },
    ]);

    expect(cart.checkoutUrl).toContain('myshopify.com');
    expect(cart.id).toBeDefined();
  });
});
