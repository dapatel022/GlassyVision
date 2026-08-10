import type { PairConfig } from '@/features/subscriptions/lib/pair-config';

/**
 * Pure reducer for the plan-builder's client-side state — tier + per-pair
 * configuration. Deliberately free of React/localStorage so it is unit
 * testable in isolation from BuilderContext.tsx (which wires it to
 * useReducer + persistence).
 */

export type Tier = 'solo' | 'duo' | 'trio';

export interface BuilderState {
  tier: Tier | null;
  pairs: Array<PairConfig | null>;
}

export type BuilderAction =
  | { type: 'setTier'; tier: Tier; pairs: number }
  | { type: 'setPair'; index: number; config: PairConfig }
  | { type: 'clearPair'; index: number }
  | { type: 'reset' };

export const INITIAL_BUILDER_STATE: BuilderState = { tier: null, pairs: [] };

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'setTier': {
      // Resize the pairs array to the new tier's pair count, preserving the
      // existing prefix: shrinking drops trailing pairs (configured or not),
      // growing appends nulls for the newly-available slots.
      const pairs: Array<PairConfig | null> = [];
      for (let i = 0; i < action.pairs; i++) {
        pairs.push(i < state.pairs.length ? state.pairs[i] : null);
      }
      return { tier: action.tier, pairs };
    }
    case 'setPair': {
      if (action.index < 0 || action.index >= state.pairs.length) return state;
      const pairs = [...state.pairs];
      pairs[action.index] = action.config;
      return { ...state, pairs };
    }
    case 'clearPair': {
      if (action.index < 0 || action.index >= state.pairs.length) return state;
      const pairs = [...state.pairs];
      pairs[action.index] = null;
      return { ...state, pairs };
    }
    case 'reset':
      return INITIAL_BUILDER_STATE;
    default:
      return state;
  }
}

/** Live tier → pair-count entitlement, e.g. `{ solo: 1, duo: 2, trio: 3 }` from `data.tiers`. */
export type TierPairsMap = Partial<Record<Tier, number>>;

/**
 * Reconciles a stored (shape-validated but otherwise untrusted) builder
 * state — e.g. a hand-edited `gv_builder_v1` localStorage entry — against
 * the live tier→pairs entitlement. Pure and free of localStorage/React so
 * BuilderContext's hydration path stays unit-testable.
 *
 * Two independent trust boundaries, both fail closed to
 * INITIAL_BUILDER_STATE:
 *  - `stored.tier` must be a tier that's actually live in `tierPairs` —
 *    a stale/unknown tier string is never trusted.
 *  - the REAL pair count for that tier (from `tierPairs`) is authoritative,
 *    never `stored.pairs.length` — an oversized stored array (e.g. a
 *    "solo" plan hand-edited to carry 5 pairs) is clamped to the tier's
 *    actual entitlement, dropping the excess (prefix kept). A short array
 *    is padded with nulls, mirroring builderReducer's own resize semantics.
 */
export function reconcileHydratedState(stored: BuilderState | null, tierPairs: TierPairsMap | undefined): BuilderState {
  if (!stored || !stored.tier) return INITIAL_BUILDER_STATE;
  const realPairs = tierPairs?.[stored.tier];
  if (typeof realPairs !== 'number') return INITIAL_BUILDER_STATE;
  const pairs: Array<PairConfig | null> = [];
  for (let i = 0; i < realPairs; i++) {
    pairs.push(i < stored.pairs.length ? stored.pairs[i] : null);
  }
  return { tier: stored.tier, pairs };
}
