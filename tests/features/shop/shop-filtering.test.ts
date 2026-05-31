import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetProducts = vi.fn();
vi.mock('@/lib/commerce/shopify', () => ({
  getProducts: mockGetProducts,
}));

const MOCK_PRODUCTS = [
  {
    id: '1',
    title: 'Bombay Square',
    handle: 'bombay-square',
    price: '128',
    currencyCode: 'USD',
    images: [],
    variants: [{ title: 'M', id: 'v1', price: '128', availableForSale: true, selectedOptions: [] }],
  },
  {
    id: '2',
    title: 'Jaipur Round Sun',
    handle: 'jaipur-round-sun',
    price: '148',
    currencyCode: 'USD',
    images: [],
    variants: [{ title: 'Small', id: 'v2', price: '148', availableForSale: true, selectedOptions: [] }],
  },
  {
    id: '3',
    title: 'Kochi Aviator',
    handle: 'kochi-aviator',
    price: '138',
    currencyCode: 'USD',
    images: [],
    variants: [{ title: 'Large', id: 'v3', price: '138', availableForSale: true, selectedOptions: [] }],
  },
];

describe('Shop Page Catalog Filtering', () => {
  beforeEach(() => {
    mockGetProducts.mockReset();
    mockGetProducts.mockResolvedValue(MOCK_PRODUCTS);
  });

  it('renders all products when no filters are active', async () => {
    const { default: ShopPage } = await import('@/app/(site)/shop/page');
    const jsx = await ShopPage({ searchParams: Promise.resolve({}) });

    const cards = jsx.props.children[2].props.children;
    expect(cards).toHaveLength(3);
  });

  it('filters by shape parameter (e.g. square)', async () => {
    const { default: ShopPage } = await import('@/app/(site)/shop/page');
    const jsx = await ShopPage({ searchParams: Promise.resolve({ shape: 'square' }) });

    const cards = jsx.props.children[2].props.children;
    expect(cards).toHaveLength(1);
    expect(cards[0].props.product.handle).toBe('bombay-square');
  });

  it('filters by size parameter (e.g. S)', async () => {
    const { default: ShopPage } = await import('@/app/(site)/shop/page');
    const jsx = await ShopPage({ searchParams: Promise.resolve({ size: 'S' }) });

    const cards = jsx.props.children[2].props.children;
    expect(cards).toHaveLength(1);
    expect(cards[0].props.product.handle).toBe('jaipur-round-sun');
  });

  it('filters by sun parameter (e.g. sun=true for sunglasses)', async () => {
    const { default: ShopPage } = await import('@/app/(site)/shop/page');
    const jsx = await ShopPage({ searchParams: Promise.resolve({ sun: 'true' }) });

    const cards = jsx.props.children[2].props.children;
    expect(cards).toHaveLength(1);
    expect(cards[0].props.product.handle).toBe('jaipur-round-sun');
  });
});
