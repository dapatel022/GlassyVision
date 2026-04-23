import { describe, it, expect } from 'vitest';
import { lensDelta, lensRequiresRx, DEFAULT_LENS_CONFIG } from '@/features/shop/lens-options';

describe('lens-options', () => {
  it('default config has zero delta and no Rx', () => {
    expect(lensDelta(DEFAULT_LENS_CONFIG)).toBe(0);
    expect(lensRequiresRx(DEFAULT_LENS_CONFIG)).toBe(false);
  });

  it('single-vision Rx adds 50', () => {
    expect(lensDelta({ lensType: 'single_vision', coatings: [], tint: 'none' })).toBe(50);
    expect(lensRequiresRx({ lensType: 'single_vision', coatings: [], tint: 'none' })).toBe(true);
  });

  it('progressive Rx adds 150', () => {
    expect(lensDelta({ lensType: 'progressive', coatings: [], tint: 'none' })).toBe(150);
  });

  it('sums coatings and tint', () => {
    expect(lensDelta({
      lensType: 'single_vision',
      coatings: ['ar', 'blue_light'],
      tint: 'grey',
    })).toBe(50 + 30 + 25 + 40);
  });

  it('unknown option ids contribute 0', () => {
    expect(lensDelta({
      lensType: 'single_vision',
      coatings: ['nonexistent'],
      tint: 'invalid',
    })).toBe(50);
  });
});
