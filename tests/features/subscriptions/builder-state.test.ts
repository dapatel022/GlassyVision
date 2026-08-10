import { describe, it, expect } from 'vitest';
import {
  builderReducer,
  reconcileHydratedState,
  canPersistAfterHydration,
  INITIAL_BUILDER_STATE,
  type BuilderState,
  type TierPairsMap,
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

describe('reconcileHydratedState', () => {
  const LIVE_TIER_PAIRS: TierPairsMap = { solo: 1, duo: 2, trio: 3 };

  it('clamps a stored solo plan carrying 5 well-formed pairs down to exactly 1 pair', () => {
    const tampered: BuilderState = { tier: 'solo', pairs: [CFG_1, CFG_2, CFG_1, CFG_2, CFG_1] };
    const next = reconcileHydratedState(tampered, LIVE_TIER_PAIRS);
    expect(next.tier).toBe('solo');
    expect(next.pairs).toEqual([CFG_1]);
  });

  it('falls back to the initial state when the stored tier is not present in live tiers', () => {
    const stored: BuilderState = { tier: 'duo', pairs: [CFG_1, CFG_2] };
    const next = reconcileHydratedState(stored, { solo: 1, trio: 3 }); // duo missing
    expect(next).toEqual(INITIAL_BUILDER_STATE);
  });

  it('pads a stored pairs array shorter than the tier count with nulls', () => {
    const stored: BuilderState = { tier: 'trio', pairs: [CFG_1] };
    const next = reconcileHydratedState(stored, LIVE_TIER_PAIRS);
    expect(next.tier).toBe('trio');
    expect(next.pairs).toEqual([CFG_1, null, null]);
  });

  it('falls back to the initial state for a null stored state or a null stored tier', () => {
    expect(reconcileHydratedState(null, LIVE_TIER_PAIRS)).toEqual(INITIAL_BUILDER_STATE);
    expect(reconcileHydratedState({ tier: null, pairs: [] }, LIVE_TIER_PAIRS)).toEqual(INITIAL_BUILDER_STATE);
  });

  it('falls back to the initial state when no live tiers are known at all', () => {
    const stored: BuilderState = { tier: 'solo', pairs: [CFG_1] };
    expect(reconcileHydratedState(stored, undefined)).toEqual(INITIAL_BUILDER_STATE);
  });
});

describe('canPersistAfterHydration', () => {
  const LIVE_TIER_PAIRS: TierPairsMap = { solo: 1, duo: 2, trio: 3 };

  it('is false when tierPairs is undefined — a transient pricing outage must not overwrite a stored plan', () => {
    expect(canPersistAfterHydration(undefined)).toBe(false);
  });

  it('is true whenever tierPairs was actually fetched, even if empty or missing the stored tier', () => {
    expect(canPersistAfterHydration(LIVE_TIER_PAIRS)).toBe(true);
    expect(canPersistAfterHydration({})).toBe(true);
    expect(canPersistAfterHydration({ solo: 1 })).toBe(true); // duo/trio absent is a real, live table
  });
});

describe('hydration survives a transient pricing outage (N1 regression)', () => {
  const LIVE_TIER_PAIRS: TierPairsMap = { solo: 1, duo: 2, trio: 3 };
  const REAL_STORED_PLAN: BuilderState = { tier: 'trio', pairs: [CFG_1, CFG_2, null] };

  it('(a) a load with tierPairs unavailable reconciles to the initial state AND is marked non-persistable, so the real stored plan is never overwritten', () => {
    // Simulates BuilderContext's hydration effect on a load where the
    // pricing fetch failed (tierPairs undefined): the in-session view is
    // fail-closed empty, but canPersist must independently say "don't
    // write" so the write effect skips entirely and REAL_STORED_PLAN in
    // localStorage is left byte-for-byte untouched.
    const sessionView = reconcileHydratedState(REAL_STORED_PLAN, undefined);
    expect(sessionView).toEqual(INITIAL_BUILDER_STATE);
    expect(canPersistAfterHydration(undefined)).toBe(false);
  });

  it('(b) a later load with pricing restored reconciles the SAME untouched stored plan intact, and is marked persistable again', () => {
    // Because (a) never wrote anything, the "stored" value here is exactly
    // what a real localStorage entry would still contain on the next load.
    const sessionView = reconcileHydratedState(REAL_STORED_PLAN, LIVE_TIER_PAIRS);
    expect(sessionView).toEqual(REAL_STORED_PLAN);
    expect(canPersistAfterHydration(LIVE_TIER_PAIRS)).toBe(true);
  });
});
