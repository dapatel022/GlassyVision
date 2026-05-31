import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/commerce/shopify-storefront', () => ({
  storefrontFetch: vi.fn(() => Promise.reject(new Error('storefront down'))),
  PRODUCTS_QUERY: 'q',
  PRODUCT_BY_HANDLE_QUERY: 'q2',
  CART_CREATE_MUTATION: 'q3',
}));
vi.mock('@/lib/commerce/shopify-admin', () => ({
  updateInventoryLevel: vi.fn(),
  createFulfillment: vi.fn(),
  createRefund: vi.fn(),
}));

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe('Shopify mock-data fallback gating', () => {
  it('serves mock products in non-production when the storefront fails (dev DX)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { getProducts } = await import('@/lib/commerce/shopify');
    const products = await getProducts();
    expect(products.length).toBeGreaterThan(0);
  });

  it('does NOT serve fake products in production (returns empty instead)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { getProducts, getProductByHandle } = await import('@/lib/commerce/shopify');
    expect(await getProducts()).toEqual([]);
    expect(await getProductByHandle('gv-01-archetype')).toBeNull();
  });
});
