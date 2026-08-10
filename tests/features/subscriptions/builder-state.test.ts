import { describe, it, expect } from 'vitest';
import {
  builderReducer,
  INITIAL_BUILDER_STATE,
  type BuilderState,
} from '@/features/subscriptions/builder/builder-state';
import type { PairConfig } from '@/features/subscriptions/lib/pair-config';

const CFG_1: PairConfig = { v: 1, h: 'dusk-wayfarer', l: 'non_rx', u: [], t: 'none' };
const CFG_2: PairConfig = { v: 2, h: 'marina-oval-sun', l: 'single_vision', u: [], t: 'grey' };

describe('builderReducer', () => {
  it('setTier trio from the initial state yields 3 null pairs', () => {
    const next = builderReducer(INITIAL_BUILDER_STATE, { type: 'setTier', tier: 'trio', pairs: 3 });
    expect(next.tier).toBe('trio');
    expect(next.pairs).toEqual([null, null, null]);
  });

  it('downgrading trio -> solo with 2 configured pairs keeps pair 1 only', () => {
    const trioWithTwoConfigured: BuilderState = { tier: 'trio', pairs: [CFG_1, CFG_2, null] };
    const next = builderReducer(trioWithTwoConfigured, { type: 'setTier', tier: 'solo', pairs: 1 });
    expect(next.tier).toBe('solo');
    expect(next.pairs).toEqual([CFG_1]);
  });

  it('upgrading solo -> trio preserves pair 1 and appends nulls', () => {
    const soloConfigured: BuilderState = { tier: 'solo', pairs: [CFG_1] };
    const next = builderReducer(soloConfigured, { type: 'setTier', tier: 'trio', pairs: 3 });
    expect(next.tier).toBe('trio');
    expect(next.pairs).toEqual([CFG_1, null, null]);
  });

  it('setPair / clearPair round-trip on a given index', () => {
    const start = builderReducer(INITIAL_BUILDER_STATE, { type: 'setTier', tier: 'duo', pairs: 2 });
    const withPair = builderReducer(start, { type: 'setPair', index: 1, config: CFG_2 });
    expect(withPair.pairs).toEqual([null, CFG_2]);
    expect(withPair.pairs[0]).toBeNull();

    const cleared = builderReducer(withPair, { type: 'clearPair', index: 1 });
    expect(cleared.pairs).toEqual([null, null]);
  });

  it('reset clears back to the initial state', () => {
    const dirty: BuilderState = { tier: 'trio', pairs: [CFG_1, CFG_2, null] };
    const next = builderReducer(dirty, { type: 'reset' });
    expect(next).toEqual(INITIAL_BUILDER_STATE);
  });
});
