import { describe, it, expect } from 'vitest';
import {
  encodePairAttributes, parsePairProperty, validatePairConfigs,
  chargeableOptionIds, pairRedemptionLensConfig, PAIR_ATTR_MAX,
  type PairConfig,
} from '@/features/subscriptions/lib/pair-config';

const RX_PAIR: PairConfig = { v: 43038182735943, h: 'dusk-wayfarer', l: 'progressive', u: ['progressive', 'photochromic'], t: 'grey' };
const PLANO_PAIR: PairConfig = { v: 43038182735944, h: 'marina-oval-sun', l: 'non_rx', u: [], t: 'none', b: true };

describe('encodePairAttributes', () => {
  it('emits _pair_N keys in order with parseable JSON values', () => {
    const attrs = encodePairAttributes([RX_PAIR, PLANO_PAIR]);
    expect(attrs.map((a) => a.key)).toEqual(['_pair_1', '_pair_2']);
    expect(JSON.parse(attrs[0].value)).toMatchObject({ v: RX_PAIR.v, l: 'progressive' });
  });
  it('stays under the 255-char Shopify attribute limit at worst case', () => {
    const worst: PairConfig = {
      v: 99999999999999, h: 'a'.repeat(60), l: 'single_vision',
      u: ['photochromic', 'ar'], t: 'amber', b: true,
    };
    const [attr] = encodePairAttributes([worst]);
    expect(attr.value.length).toBeLessThanOrEqual(PAIR_ATTR_MAX);
  });
});

describe('parsePairProperty', () => {
  it('round-trips an encoded attribute', () => {
    const [attr] = encodePairAttributes([RX_PAIR]);
    const parsed = parsePairProperty(attr.key, attr.value);
    expect(parsed).toEqual({ index: 1, config: RX_PAIR });
  });
  it('accepts the webhook-normalized name form (pair1)', () => {
    const [attr] = encodePairAttributes([PLANO_PAIR]);
    expect(parsePairProperty('pair1', attr.value)?.config.h).toBe('marina-oval-sun');
  });
  it('returns null for non-pair names and malformed JSON', () => {
    expect(parsePairProperty('lens_type', '{}')).toBeNull();
    expect(parsePairProperty('_pair_1', 'not-json')).toBeNull();
    expect(parsePairProperty('_pair_1', '{"v":"NaN"}')).toBeNull();
  });
});

describe('validatePairConfigs', () => {
  it('accepts a valid array within the plan size', () => {
    const r = validatePairConfigs([RX_PAIR, PLANO_PAIR], 3);
    expect(r.ok).toBe(true);
  });
  it('rejects more configs than the plan has pairs', () => {
    const r = validatePairConfigs([RX_PAIR, RX_PAIR, PLANO_PAIR, PLANO_PAIR], 3);
    expect(r.ok).toBe(false);
  });
  it('rejects progressive upgrade without progressive lens type (and vice versa)', () => {
    expect(validatePairConfigs([{ ...RX_PAIR, l: 'single_vision' }], 3).ok).toBe(false);
    expect(validatePairConfigs([{ ...RX_PAIR, u: ['photochromic'] }], 3).ok).toBe(false);
  });
  it('rejects unknown upgrade ids, bad tints, non-numeric variant ids', () => {
    expect(validatePairConfigs([{ ...PLANO_PAIR, u: ['blue_light'] }], 3).ok).toBe(false); // covered, never chargeable
    expect(validatePairConfigs([{ ...PLANO_PAIR, t: 'purple' as never }], 3).ok).toBe(false);
    expect(validatePairConfigs([{ ...PLANO_PAIR, v: -1 }], 3).ok).toBe(false);
  });
  it('rejects non-arrays', () => {
    expect(validatePairConfigs('nope', 3).ok).toBe(false);
    expect(validatePairConfigs(null, 3).ok).toBe(false);
  });
  it('rejects duplicate upgrade ids', () => {
    expect(validatePairConfigs([{ ...PLANO_PAIR, u: ['ar', 'ar'] }], 3).ok).toBe(false);
  });
});

describe('chargeableOptionIds', () => {
  it('is u plus the tint when tinted', () => {
    expect(chargeableOptionIds(RX_PAIR)).toEqual(['progressive', 'photochromic', 'grey']);
  });
  it('is empty for a fully covered pair (blue-light is covered)', () => {
    expect(chargeableOptionIds(PLANO_PAIR)).toEqual([]);
  });
});

describe('pairRedemptionLensConfig', () => {
  it("maps non_rx to 'plano' so redemption-order treats it as non-Rx", () => {
    expect(pairRedemptionLensConfig(PLANO_PAIR)).toEqual({
      lens_type: 'plano', coatings: ['blue_light'], tint: 'none',
    });
  });
  it('keeps Rx types verbatim and folds coatings correctly', () => {
    expect(pairRedemptionLensConfig(RX_PAIR)).toEqual({
      lens_type: 'progressive', coatings: ['photochromic'], tint: 'grey',
    });
  });
});
