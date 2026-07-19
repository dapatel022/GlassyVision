import { describe, it, expect } from 'vitest';
import {
  SORT_OPTIONS,
  parseCatalogSearchParams,
  filterValueParam,
  toggleFilterParam,
  setSingleParam,
  withAfter,
  activeFilterEntries,
  mapLegacyShopParams,
  buildQuizShopUrl,
} from '@/lib/commerce/catalog-filters';

describe('parseCatalogSearchParams', () => {
  it('returns defaults for empty params', () => {
    const q = parseCatalogSearchParams({});
    expect(q.filters).toEqual([]);
    expect(q.sort).toBe('featured');
    expect(q.sortKey).toBe('COLLECTION_DEFAULT');
    expect(q.reverse).toBe(false);
    expect(q.after).toBeNull();
  });

  it('ignores empty-string filter values', () => {
    const q = parseCatalogSearchParams({ vendor: '', ptype: '', tag: '', 'opt.color': '', 'm.custom.gender': '' });
    expect(q.filters).toEqual([]);
  });

  it('maps every documented param kind to its ProductFilter', () => {
    const q = parseCatalogSearchParams({
      vendor: 'GlassyVision',
      ptype: 'Sunglasses',
      tag: 'new',
      available: 'true',
      'opt.color': 'Black',
      'm.custom.frame_shape': 'round',
      price: '50-150',
    });
    expect(q.filters).toEqual(
      expect.arrayContaining([
        { productVendor: 'GlassyVision' },
        { productType: 'Sunglasses' },
        { tag: 'new' },
        { available: true },
        { variantOption: { name: 'color', value: 'Black' } },
        { productMetafield: { namespace: 'custom', key: 'frame_shape', value: 'round' } },
        { price: { min: 50, max: 150 } },
      ]),
    );
    expect(q.filters).toHaveLength(7);
  });

  it('expands repeated params into multiple filters (OR semantics)', () => {
    const q = parseCatalogSearchParams({ 'm.custom.frame_shape': ['round', 'aviator'] });
    expect(q.filters).toEqual([
      { productMetafield: { namespace: 'custom', key: 'frame_shape', value: 'round' } },
      { productMetafield: { namespace: 'custom', key: 'frame_shape', value: 'aviator' } },
    ]);
  });

  it('parses open-ended price ranges', () => {
    expect(parseCatalogSearchParams({ price: '50-' }).filters).toEqual([{ price: { min: 50 } }]);
    expect(parseCatalogSearchParams({ price: '-150' }).filters).toEqual([{ price: { max: 150 } }]);
  });

  it('ignores unknown, reserved, and malformed params', () => {
    const q = parseCatalogSearchParams({
      quiz: 'true',
      bogus: 'x',
      price: 'not-a-range',
      'm.broken': 'novalue', // missing key segment
      sort: 'price-asc',
      after: 'cursor123',
    });
    expect(q.filters).toEqual([]);
    expect(q.sort).toBe('price-asc');
    expect(q.sortKey).toBe('PRICE');
    expect(q.reverse).toBe(false);
    expect(q.after).toBe('cursor123');
  });

  it('maps every sort option to the documented sortKey/reverse', () => {
    const bySort = Object.fromEntries(SORT_OPTIONS.map((o) => [o.value, o]));
    expect(bySort['featured']).toMatchObject({ sortKey: 'COLLECTION_DEFAULT', reverse: false });
    expect(bySort['price-asc']).toMatchObject({ sortKey: 'PRICE', reverse: false });
    expect(bySort['price-desc']).toMatchObject({ sortKey: 'PRICE', reverse: true });
    expect(bySort['newest']).toMatchObject({ sortKey: 'CREATED', reverse: true });
    expect(bySort['best-selling']).toMatchObject({ sortKey: 'BEST_SELLING', reverse: false });
    expect(bySort['title']).toMatchObject({ sortKey: 'TITLE', reverse: false });
    // unknown sort falls back to featured
    expect(parseCatalogSearchParams({ sort: 'nonsense' }).sortKey).toBe('COLLECTION_DEFAULT');
  });
});

describe('filterValueParam (facet input JSON -> URL param pair)', () => {
  it('maps each Storefront filter input shape', () => {
    expect(filterValueParam('{"available":true}')).toEqual({ key: 'available', value: 'true' });
    expect(filterValueParam('{"productVendor":"GlassyVision"}')).toEqual({ key: 'vendor', value: 'GlassyVision' });
    expect(filterValueParam('{"productType":"Sunglasses"}')).toEqual({ key: 'ptype', value: 'Sunglasses' });
    expect(filterValueParam('{"tag":"new"}')).toEqual({ key: 'tag', value: 'new' });
    expect(filterValueParam('{"variantOption":{"name":"color","value":"Black"}}')).toEqual({
      key: 'opt.color', value: 'Black',
    });
    expect(filterValueParam('{"productMetafield":{"namespace":"custom","key":"frame_shape","value":"round"}}')).toEqual({
      key: 'm.custom.frame_shape', value: 'round',
    });
  });

  it('returns null for price and unknown shapes and invalid JSON', () => {
    expect(filterValueParam('{"price":{"min":0,"max":200}}')).toBeNull();
    expect(filterValueParam('{"somethingNew":1}')).toBeNull();
    expect(filterValueParam('not json')).toBeNull();
  });
});

describe('URL mutation helpers', () => {
  it('toggleFilterParam adds, removes, and always drops after', () => {
    const added = toggleFilterParam('sort=newest&after=abc', 'vendor', 'GV');
    const p1 = new URLSearchParams(added);
    expect(p1.getAll('vendor')).toEqual(['GV']);
    expect(p1.get('sort')).toBe('newest');
    expect(p1.get('after')).toBeNull();

    const removed = toggleFilterParam('vendor=GV&vendor=Other', 'vendor', 'GV');
    expect(new URLSearchParams(removed).getAll('vendor')).toEqual(['Other']);
  });

  it('setSingleParam sets, replaces, deletes, and drops after', () => {
    expect(new URLSearchParams(setSingleParam('', 'sort', 'price-asc')).get('sort')).toBe('price-asc');
    expect(new URLSearchParams(setSingleParam('sort=x&after=c', 'sort', 'newest')).get('after')).toBeNull();
    expect(new URLSearchParams(setSingleParam('sort=x', 'sort', null)).get('sort')).toBeNull();
  });

  it('withAfter appends the cursor without touching filters', () => {
    const qs = withAfter('vendor=GV', 'CURSOR');
    const p = new URLSearchParams(qs);
    expect(p.get('after')).toBe('CURSOR');
    expect(p.get('vendor')).toBe('GV');
  });

  it('activeFilterEntries lists filter params only', () => {
    expect(activeFilterEntries('vendor=GV&sort=newest&after=c&quiz=true&m.custom.gender=mens')).toEqual([
      { key: 'vendor', value: 'GV' },
      { key: 'm.custom.gender', value: 'mens' },
    ]);
  });
});

describe('legacy /shop param mapping', () => {
  it('maps shape/size/sun/quiz to the new contract', () => {
    const qs = mapLegacyShopParams({ shape: 'round,aviator', size: 'm', sun: 'true', quiz: 'true', style: 'bold' });
    const p = new URLSearchParams(qs);
    expect(p.getAll('m.custom.frame_shape')).toEqual(['round', 'aviator']);
    expect(p.get('opt.size')).toBe('Medium');
    expect(p.get('m.custom.lens_intent')).toBe('sunglasses');
    expect(p.get('quiz')).toBe('true');
    expect(p.get('style')).toBeNull(); // legacy style had no real behavior — dropped
  });

  it('normalizes rectangular->rectangle, ignores any, maps sun=false to clear-rx', () => {
    const qs = mapLegacyShopParams({ shape: 'rectangular', size: 'any', sun: 'false' });
    const p = new URLSearchParams(qs);
    expect(p.getAll('m.custom.frame_shape')).toEqual(['rectangle']);
    expect(p.get('opt.size')).toBeNull();
    expect(p.get('m.custom.lens_intent')).toBe('clear-rx');
  });

  it('accepts uppercase legacy size values (quiz emits "M")', () => {
    const p = new URLSearchParams(mapLegacyShopParams({ size: 'M' }));
    expect(p.get('opt.size')).toBe('Medium');
  });
});

describe('buildQuizShopUrl', () => {
  it('builds the /shop/all URL from quiz answers (oval face -> square+rectangle)', () => {
    const url = buildQuizShopUrl({ shape: 'oval', size: 'm', intent: 'rx_sun', style: 'bold' });
    expect(url.startsWith('/shop/all?')).toBe(true);
    const p = new URLSearchParams(url.split('?')[1]);
    expect(p.getAll('m.custom.frame_shape')).toEqual(['square', 'rectangle']);
    expect(p.get('opt.size')).toBe('Medium');
    expect(p.get('m.custom.lens_intent')).toBe('sunglasses');
    expect(p.get('quiz')).toBe('true');
  });

  it('omits the shape filter for unmapped face shapes and maps non-sun intents to clear-rx', () => {
    const url = buildQuizShopUrl({ shape: 'round', size: 's', intent: 'rx_clear' });
    const p = new URLSearchParams(url.split('?')[1]);
    expect(p.getAll('m.custom.frame_shape')).toEqual([]);
    expect(p.get('opt.size')).toBe('Small');
    expect(p.get('m.custom.lens_intent')).toBe('clear-rx');
  });

  it('maps uppercase quiz size answers', () => {
    const url = buildQuizShopUrl({ shape: 'oval', size: 'L', intent: 'rx_clear' });
    expect(new URLSearchParams(url.split('?')[1]).get('opt.size')).toBe('Large');
  });
});
