import { describe, it, expect } from 'vitest';
import { selectedOptionIds, lensRequiresRx, DEFAULT_LENS_CONFIG } from '@/features/shop/lens-options';

describe('lens-options', () => {
  it('default config selects no paid options and requires no Rx', () => {
    expect(selectedOptionIds(DEFAULT_LENS_CONFIG)).toEqual([]);
    expect(lensRequiresRx(DEFAULT_LENS_CONFIG)).toBe(false);
  });

  it('Rx lens types are paid options and require an Rx', () => {
    expect(selectedOptionIds({ lensType: 'single_vision', coatings: [], tint: 'none' })).toEqual(['single_vision']);
    expect(lensRequiresRx({ lensType: 'single_vision', coatings: [], tint: 'none' })).toBe(true);
    expect(selectedOptionIds({ lensType: 'progressive', coatings: [], tint: 'none' })).toEqual(['progressive']);
  });

  it('collects lens type, every coating, and a non-clear tint in order', () => {
    expect(selectedOptionIds({
      lensType: 'single_vision',
      coatings: ['ar', 'blue_light'],
      tint: 'grey',
    })).toEqual(['single_vision', 'ar', 'blue_light', 'grey']);
  });

  it('non_rx and clear tint are free — never emitted as options', () => {
    expect(selectedOptionIds({ lensType: 'non_rx', coatings: ['photochromic'], tint: 'none' })).toEqual(['photochromic']);
  });
});
