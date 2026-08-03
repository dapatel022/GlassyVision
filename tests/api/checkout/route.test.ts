import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CartLine } from '@/features/cart/types';

const createCart = vi.fn((..._a: unknown[]) => Promise.resolve({ id: 'cart-1', checkoutUrl: 'https://shop/checkout', lines: [] }));
vi.mock('@/lib/commerce/shopify', () => ({
  createCart: (...a: unknown[]) => createCart(...a),
}));

const getLensUpgradePricing = vi.fn();
vi.mock('@/lib/commerce/lens-pricing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getLensUpgradePricing: () => getLensUpgradePricing() };
});

const FULL_PRICING = {
  single_vision: { optionId: 'single_vision', variantId: 'gid://v/sv', price: 50, currencyCode: 'USD' },
  progressive: { optionId: 'progressive', variantId: 'gid://v/prog', price: 150, currencyCode: 'USD' },
  ar: { optionId: 'ar', variantId: 'gid://v/ar', price: 30, currencyCode: 'USD' },
  blue_light: { optionId: 'blue_light', variantId: 'gid://v/bl', price: 25, currencyCode: 'USD' },
  photochromic: { optionId: 'photochromic', variantId: 'gid://v/pc', price: 85, currencyCode: 'USD' },
  grey: { optionId: 'grey', variantId: 'gid://v/grey', price: 40, currencyCode: 'USD' },
  amber: { optionId: 'amber', variantId: 'gid://v/amber', price: 40, currencyCode: 'USD' },
  green: { optionId: 'green', variantId: 'gid://v/green', price: 40, currencyCode: 'USD' },
};

function frameLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: 'gid://p/1',
    variantId: 'gid://v/frame',
    productHandle: 'aviator',
    title: 'Aviator',
    image: null,
    unitPrice: 129,
    quantity: 1,
    lensConfig: { lensType: 'non_rx', coatings: [], tint: 'none' },
    ...overrides,
  };
}

let reqSeq = 0;
function req(lines: CartLine[]) {
  return {
    json: () => Promise.resolve({ lines }),
    // Unique IP per call so the module-level rate limiter never interferes
    // across tests (the route module is import-cached within this file).
    headers: new Headers({ 'x-forwarded-for': `198.51.100.${++reqSeq}` }),
  } as unknown as Parameters<typeof import('@/app/checkout/route').POST>[0];
}

type SentLine = { merchandiseId: string; quantity: number; attributes?: Array<{ key: string; value: string }> };

beforeEach(() => {
  createCart.mockClear();
  getLensUpgradePricing.mockReset();
  getLensUpgradePricing.mockResolvedValue(FULL_PRICING);
});

describe('POST /checkout — lens upgrade add-on lines', () => {
  it('appends one paired add-on line per selected upgrade, matching frame quantity', async () => {
    const { POST } = await import('@/app/checkout/route');
    const res = await POST(req([
      frameLine({ quantity: 2, lensConfig: { lensType: 'progressive', coatings: ['ar'], tint: 'grey' } }),
    ]));

    expect(res.status).toBe(200);
    const sent = (createCart.mock.calls[0] as unknown[])[0] as SentLine[];
    expect(sent).toHaveLength(4); // frame + progressive + ar + grey

    const frame = sent[0];
    const ref = frame.attributes?.find((a) => a.key === 'line_ref')?.value;
    expect(ref).toBeTruthy();

    const addons = sent.slice(1);
    expect(addons.map((a) => a.merchandiseId).sort()).toEqual(['gid://v/ar', 'gid://v/grey', 'gid://v/prog'].sort());
    for (const addon of addons) {
      expect(addon.quantity).toBe(2);
      expect(addon.attributes).toEqual(expect.arrayContaining([
        { key: '_addon_for', value: ref },
        { key: 'is_rx_required', value: 'false' },
      ]));
    }
  });

  it('sends only the frame line for a non-Rx clear configuration', async () => {
    const { POST } = await import('@/app/checkout/route');
    const res = await POST(req([frameLine()]));

    expect(res.status).toBe(200);
    const sent = (createCart.mock.calls[0] as unknown[])[0] as SentLine[];
    expect(sent).toHaveLength(1);
  });

  it('409s (and never calls Shopify) when pricing is unavailable and a paid upgrade is selected', async () => {
    getLensUpgradePricing.mockResolvedValue(null);
    const { POST } = await import('@/app/checkout/route');
    const res = await POST(req([
      frameLine({ lensConfig: { lensType: 'single_vision', coatings: [], tint: 'none' } }),
    ]));

    expect(res.status).toBe(409);
    expect(createCart).not.toHaveBeenCalled();
  });

  it('409s when one selected option is missing from the pricing map', async () => {
    getLensUpgradePricing.mockResolvedValue({ ...FULL_PRICING, photochromic: undefined });
    const { POST } = await import('@/app/checkout/route');
    const res = await POST(req([
      frameLine({ lensConfig: { lensType: 'non_rx', coatings: ['photochromic'], tint: 'none' } }),
    ]));

    expect(res.status).toBe(409);
    expect(createCart).not.toHaveBeenCalled();
  });

  it('still checks out frame-only carts when pricing is unavailable', async () => {
    getLensUpgradePricing.mockResolvedValue(null);
    const { POST } = await import('@/app/checkout/route');
    const res = await POST(req([frameLine()]));
    expect(res.status).toBe(200);
  });
});
