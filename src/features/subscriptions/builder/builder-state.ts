import type { PairConfig } from '@/features/subscriptions/lib/pair-config';

/**
 * Pure reducer for the plan-builder's client-side state — tier + per-pair
 * configuration. Deliberately free of React/localStorage so it is unit
 * testable in isolation from BuilderContext.tsx (which wires it to
 * useReducer + persistence).
 */

export interface BuilderState {
  tier: 'solo' | 'duo' | 'trio' | null;
  pairs: Array<PairConfig | null>;
}

export type BuilderAction =
  | { type: 'setTier'; tier: 'solo' | 'duo' | 'trio'; pairs: number }
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
