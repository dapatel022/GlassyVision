import { describe, it, expect } from 'vitest';
import { parseNextPageInfo } from '@/lib/commerce/shopify-admin';

describe('parseNextPageInfo', () => {
  it('returns null when there is no Link header', () => {
    expect(parseNextPageInfo(null)).toBeNull();
    expect(parseNextPageInfo('')).toBeNull();
  });

  it('extracts the page_info cursor from a rel="next" link', () => {
    const link = '<https://x.myshopify.com/admin/api/2025-01/orders.json?limit=250&page_info=ABC123>; rel="next"';
    expect(parseNextPageInfo(link)).toBe('ABC123');
  });

  it('ignores a rel="previous" link and only follows next', () => {
    const link =
      '<https://x/orders.json?page_info=PREV>; rel="previous", <https://x/orders.json?page_info=NEXT>; rel="next"';
    expect(parseNextPageInfo(link)).toBe('NEXT');
  });

  it('returns null when only a previous link is present (last page)', () => {
    const link = '<https://x/orders.json?page_info=PREV>; rel="previous"';
    expect(parseNextPageInfo(link)).toBeNull();
  });
});
